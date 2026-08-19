import { useSyncExternalStore } from 'react'
import { taskStore, type StoreState } from './store.ts'

export function useStore(): StoreState {
  return useSyncExternalStore(taskStore.subscribe, taskStore.getSnapshot, taskStore.getSnapshot)
}

export { taskStore }
