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

export async function clearAll(): Promise<void> {
  const db = await getDB()
  await Promise.all([db.clear('tasks'), db.clear('queue'), db.clear('meta')])
}
