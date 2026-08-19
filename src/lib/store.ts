import { supabase } from './supabase.ts'
import * as cache from './db.ts'
import type { Mutation } from './db.ts'
import type { NewTask, Task } from './types.ts'
import { nextOccurrence } from './repeat.ts'

/**
 * 모든 변경은 같은 경로를 탄다:
 *   로컬 상태 갱신 → 캐시 기록 → 큐에 적재 → 전송 시도
 *
 * 온라인이면 전송이 즉시 성공하므로 큐는 비어 있다.
 * 오프라인이면 큐에 남아 있다가 연결 복구 시 순서대로 빠져나간다.
 * 혼자 쓰는 앱이므로 충돌은 updated_at 기준 last-write-wins 로 끝낸다.
 */

export interface StoreState {
  tasks: Task[]
  loading: boolean
  online: boolean
  /** 아직 서버로 못 보낸 변경 수 */
  pending: number
  /** 서버 목록을 한 번이라도 성공적으로 받아왔는지. 받기 전에는 '동기화됨'이라 말할 수 없다. */
  synced: boolean
  error: string | null
}

/** 완료 항목을 언제까지 들고 있을지. 그보다 오래된 것은 서버에서 읽지 않는다. */
const COMPLETED_RETENTION_DAYS = 30

type Listener = () => void

class TaskStore {
  private state: StoreState = {
    tasks: [],
    loading: true,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: 0,
    synced: false,
    error: null,
  }
  private listeners = new Set<Listener>()
  private userId: string | null = null
  private channel: ReturnType<typeof supabase.channel> | null = null
  private flushing = false

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): StoreState => this.state

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  private setTasks(next: Task[]) {
    this.set({ tasks: next })
  }

  // ── 수명주기 ────────────────────────────────────────────

  async init(userId: string) {
    this.userId = userId

    // 1. 캐시를 먼저 보여준다. 실행 즉시 목록이 뜨는 이유.
    const cached = await cache.cacheGetAll()
    this.setTasks(cached.filter((t) => !t.deleted_at))
    this.set({ loading: false, pending: await cache.queueCount() })

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    // 2. 밀린 변경을 먼저 밀어 넣고 나서 서버 상태를 읽는다.
    //    순서가 바뀌면 방금 오프라인에서 만든 항목이 사라진 것처럼 보인다.
    await this.flush()
    await this.pull()
    this.watch()
  }

  dispose() {
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    void this.channel?.unsubscribe()
    this.channel = null
  }

  private handleOnline = () => {
    this.set({ online: true })
    void this.flush().then(() => this.pull())
  }

  private handleOffline = () => this.set({ online: false })

  // ── 서버 읽기 ───────────────────────────────────────────

  private async pull() {
    if (!this.userId) return
    const cutoff = new Date(Date.now() - COMPLETED_RETENTION_DAYS * 86_400_000).toISOString()

    let rows: Task[]
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .or('completed_at.is.null,completed_at.gte.' + cutoff)
      if (error) throw new Error(error.message)
      rows = (data ?? []) as Task[]
    } catch (e) {
      // 연결이 끊기면 supabase-js 는 예외를 던진다. 여기서 잡지 않으면
      // init 전체가 실패하고 상태 표시가 '동기화됨'인 채로 남는다.
      // 캐시는 이미 그려져 있으므로 화면은 비우지 않는다.
      const msg = e instanceof Error ? e.message : String(e)
      this.set({ error: navigator.onLine ? msg : null, synced: false })
      return
    }

    const server = rows

    // 아직 전송되지 않은 로컬 변경이 있으면 그쪽이 최신이다.
    const queued = await cache.queueAll()
    const dirty = new Set(
      queued.map((q) => (q.mutation.kind === 'insert' ? q.mutation.task.id : q.mutation.taskId)),
    )
    const localById = new Map(this.state.tasks.map((t) => [t.id, t]))
    const merged = server.filter((t) => !dirty.has(t.id))
    for (const id of dirty) {
      const local = localById.get(id)
      if (local) merged.push(local)
    }

    await cache.cacheReplaceAll(merged)
    this.setTasks(merged)
    this.set({ error: null, synced: true })
  }

  // ── Realtime ───────────────────────────────────────────

  private watch() {
    if (!this.userId || this.channel) return
    this.channel = supabase
      .channel('tasks-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: 'user_id=eq.' + this.userId },
        (payload) => void this.applyRemote(payload as never),
      )
      .subscribe()
  }

  private async applyRemote(payload: { eventType: string; new: unknown; old: unknown }) {
    const row = payload.new as Task | null
    const old = payload.old as { id?: string } | null

    if (payload.eventType === 'DELETE' && old?.id) {
      await cache.cacheDelete(old.id)
      this.setTasks(this.state.tasks.filter((t) => t.id !== old.id))
      return
    }
    if (!row?.id) return

    // 전송 대기 중인 항목은 로컬이 더 최신이므로 덮지 않는다
    const queued = await cache.queueAll()
    const dirty = queued.some((q) =>
      q.mutation.kind === 'insert' ? q.mutation.task.id === row.id : q.mutation.taskId === row.id,
    )
    if (dirty) return

    if (row.deleted_at) {
      await cache.cacheDelete(row.id)
      this.setTasks(this.state.tasks.filter((t) => t.id !== row.id))
      return
    }

    await cache.cachePut(row)
    const idx = this.state.tasks.findIndex((t) => t.id === row.id)
    if (idx === -1) {
      this.setTasks([...this.state.tasks, row])
    } else {
      const next = this.state.tasks.slice()
      next[idx] = row
      this.setTasks(next)
    }
  }

  // ── 큐 전송 ─────────────────────────────────────────────

  private async flush() {
    if (this.flushing || !this.userId) return
    this.flushing = true
    try {
      for (const item of await cache.queueAll()) {
        const ok = await this.send(item.mutation)
        if (!ok) break // 네트워크 문제로 보고, 순서를 지키기 위해 멈춘다
        if (item.seq !== undefined) await cache.queueDelete(item.seq)
      }
    } finally {
      this.flushing = false
      this.set({ pending: await cache.queueCount() })
    }
  }

  private async send(m: Mutation): Promise<boolean> {
    try {
      if (m.kind === 'insert') {
        const { error } = await supabase.from('tasks').insert(m.task)
        // 중복 키는 이미 반영된 것이므로 성공으로 친다 (재시도 안전성)
        if (error && error.code !== '23505') throw error
      } else if (m.kind === 'update') {
        const { error } = await supabase.from('tasks').update(m.patch).eq('id', m.taskId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', m.taskId)
        if (error) throw error
      }
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 오프라인이면 조용히 큐에 남긴다. 그 외에는 사용자에게 알린다.
      this.set({ error: navigator.onLine ? msg : null })
      return false
    }
  }

  // ── 변경 API ────────────────────────────────────────────

  async add(input: NewTask): Promise<Task> {
    if (!this.userId) throw new Error('로그인이 필요합니다')
    const now = new Date().toISOString()
    const task: Task = {
      id: crypto.randomUUID(),
      user_id: this.userId,
      title: input.title,
      notes: input.notes,
      due_at: input.due_at,
      is_all_day: input.is_all_day,
      category: input.category,
      repeat: input.repeat,
      completed_at: null,
      remind_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
    this.setTasks([...this.state.tasks, task])
    await cache.cachePut(task)
    await cache.queuePush({ kind: 'insert', task })
    void this.flush()
    return task
  }

  async update(id: string, patch: Partial<Task>): Promise<void> {
    const idx = this.state.tasks.findIndex((t) => t.id === id)
    if (idx === -1) return
    const updated: Task = {
      ...this.state.tasks[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    }
    const next = this.state.tasks.slice()
    next[idx] = updated
    this.setTasks(next)
    await cache.cachePut(updated)
    // updated_at 은 서버 트리거가 정한다. 로컬 값은 화면 정렬용일 뿐이라 보내지 않는다.
    await cache.queuePush({ kind: 'update', taskId: id, patch })
    void this.flush()
  }

  /**
   * 완료 처리.
   * 반복 항목은 완료 목록으로 내리지 않고 다음 주기로 밀어 올린다.
   */
  async complete(id: string): Promise<void> {
    const task = this.state.tasks.find((t) => t.id === id)
    if (!task) return

    if (task.repeat !== 'none' && task.due_at) {
      const next = nextOccurrence(task.due_at, task.repeat)
      if (next) {
        await this.update(id, { due_at: next, completed_at: null })
        return
      }
    }
    await this.update(id, { completed_at: new Date().toISOString() })
  }

  async uncomplete(id: string): Promise<void> {
    await this.update(id, { completed_at: null })
  }

  async remove(id: string): Promise<void> {
    this.setTasks(this.state.tasks.filter((t) => t.id !== id))
    await cache.cacheDelete(id)
    await cache.queuePush({ kind: 'delete', taskId: id })
    void this.flush()
  }

  async reset() {
    this.dispose()
    await cache.clearAll()
    this.userId = null
    this.state = {
      tasks: [],
      loading: false,
      online: navigator.onLine,
      pending: 0,
      synced: false,
      error: null,
    }
    this.listeners.forEach((fn) => fn())
  }
}

export const taskStore = new TaskStore()
