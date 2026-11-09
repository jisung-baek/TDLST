import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Task } from './types.ts'

/**
 * 로컬 캐시와 오프라인 변경 큐.
 *
 * 앱은 항상 캐시를 먼저 그리고, 그 뒤에 서버 결과로 덮는다.
 * 오프라인에서 발생한 변경은 큐에 쌓였다가 연결이 돌아오면 순서대로 전송된다.
 */

export type Mutation =
  | { kind: 'insert'; task: Task }
  | { kind: 'update'; taskId: string; patch: Partial<Task> }
  | { kind: 'delete'; taskId: string }

export interface QueuedMutation {
  /** autoIncrement 키. 큐는 발생 순서대로 처리한다. */
  seq?: number
  at: string
  mutation: Mutation
}

interface TdlstDB extends DBSchema {
  tasks: { key: string; value: Task }
  queue: { key: number; value: QueuedMutation }
  meta: { key: string; value: string }
}

let dbPromise: Promise<IDBPDatabase<TdlstDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TdlstDB>('tdlst', 1, {
      upgrade(db) {
        db.createObjectStore('tasks', { keyPath: 'id' })
        db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true })
        db.createObjectStore('meta')
      },
    })
  }
  return dbPromise
}

export async function cacheGetAll(): Promise<Task[]> {
  return (await getDB()).getAll('tasks')
}

export async function cachePut(task: Task): Promise<void> {
  await (await getDB()).put('tasks', task)
}

export async function cachePutAll(tasks: Task[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('tasks', 'readwrite')
  await Promise.all(tasks.map((t) => tx.store.put(t)))
  await tx.done
}

/** 서버 목록으로 캐시를 통째로 교체한다. 다른 기기에서 지운 항목까지 반영하기 위함. */
export async function cacheReplaceAll(tasks: Task[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('tasks', 'readwrite')
  await tx.store.clear()
  await Promise.all(tasks.map((t) => tx.store.put(t)))
  await tx.done
}

export async function cacheDelete(id: string): Promise<void> {
  await (await getDB()).delete('tasks', id)
}

export async function queuePush(mutation: Mutation): Promise<void> {
  await (await getDB()).add('queue', { at: new Date().toISOString(), mutation })
}

export async function queueAll(): Promise<QueuedMutation[]> {
  const db = await getDB()
  const rows = await db.getAll('queue')
  return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function queueDelete(seq: number): Promise<void> {
  await (await getDB()).delete('queue', seq)
}

export async function queueCount(): Promise<number> {
  return (await getDB()).count('queue')
}

// ── meta / 계정 전환 ────────────────────────────────────

export async function metaGet(key: string): Promise<string | undefined> {
  return (await getDB()).get('meta', key)
}

export async function metaSet(key: string, value: string): Promise<void> {
  await (await getDB()).put('meta', value, key)
}

/** 목록만 비운다. 큐와 meta 는 건드리지 않는다. */
export async function cacheClearTasks(): Promise<void> {
  await (await getDB()).clear('tasks')
}

/**
 * 큐를 통째로 meta 에 치워 둔다.
 *
 * 계정이 바뀌면 이전 계정의 미전송 변경은 지금 토큰으로 보낼 수 없다 — RLS 가 막는다.
 * 그렇다고 버리면 오프라인에서 적은 것이 조용히 사라진다. 주인 이름표를 달아 두었다가
 * 그 계정으로 다시 들어올 때 돌려놓는다.
 */
export async function queueStash(key: string): Promise<void> {
  const db = await getDB()
  const rows = await db.getAll('queue')
  if (rows.length === 0) return
  const prev = await db.get('meta', key)
  const kept = prev ? (JSON.parse(prev) as QueuedMutation[]) : []
  // seq 는 큐에 다시 넣을 때 새로 매겨지므로 빼고 저장한다
  const merged = [...kept, ...rows.map((r) => ({ at: r.at, mutation: r.mutation }))]
  await db.put('meta', JSON.stringify(merged), key)
  await db.clear('queue')
}

/** 치워 둔 큐를 되돌린다. 없으면 아무 일도 하지 않는다. */
export async function queueUnstash(key: string): Promise<void> {
  const db = await getDB()
  const raw = await db.get('meta', key)
  if (!raw) return
  const rows = JSON.parse(raw) as QueuedMutation[]
  const tx = db.transaction('queue', 'readwrite')
  await Promise.all(rows.map((r) => tx.store.add(r)))
  await tx.done
  await db.delete('meta', key)
}

/**
 * 로그아웃 시 로컬 흔적을 지운다.
 *
 * meta 는 남긴다. 캐시 주인과 치워 둔 큐가 거기 있어서, 지우면 다시 로그인했을 때
 * 계정이 바뀌었는지 알 수 없고 아직 못 보낸 변경도 함께 사라진다.
 */
export async function clearAll(): Promise<void> {
  const db = await getDB()
  await Promise.all([db.clear('tasks'), db.clear('queue')])
}
