import type { StateStorage } from 'zustand/middleware'

export const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const res = await fetch(`/api/store/${encodeURIComponent(name)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.value ?? null
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const res = await fetch(`/api/store/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (!res.ok) console.error(`[sqlite-storage] Failed to persist "${name}": ${res.status}`)
  },

  removeItem: async (name: string): Promise<void> => {
    const res = await fetch(`/api/store/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!res.ok) console.error(`[sqlite-storage] Failed to remove "${name}": ${res.status}`)
  },
}
