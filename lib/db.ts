import type { Controle, CopieEleve } from './types'

const DB_NAME = 'iassistant'
const DB_VERSION = 1
const CONTROLES_STORE = 'controles'
const COPIES_STORE = 'copies'

function openDB (): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(CONTROLES_STORE)) {
        db.createObjectStore(CONTROLES_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(COPIES_STORE)) {
        const store = db.createObjectStore(COPIES_STORE, { keyPath: 'id' })
        store.createIndex('controleId', 'controleId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── Helpers ──────────────────────────────────────────

function tx<T> (
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const request = fn(store)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  )
}

// ─── Contrôles ────────────────────────────────────────

export async function getAllControles (): Promise<Controle[]> {
  const all = await tx<Controle[]>(CONTROLES_STORE, 'readonly', (store) => store.getAll())
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function getControle (id: string): Promise<Controle | null> {
  const result = await tx<Controle | undefined>(CONTROLES_STORE, 'readonly', (store) => store.get(id))
  return result ?? null
}

export async function saveControle (controle: Controle): Promise<void> {
  const updated = { ...controle, updatedAt: new Date().toISOString() }
  await tx(CONTROLES_STORE, 'readwrite', (store) => store.put(updated))
}

export async function deleteControle (id: string): Promise<void> {
  await tx(CONTROLES_STORE, 'readwrite', (store) => store.delete(id))
  await deleteCopiesByControle(id)
}

// ─── Copies ───────────────────────────────────────────

export async function getCopiesByControle (controleId: string): Promise<CopieEleve[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(COPIES_STORE, 'readonly')
    const store = transaction.objectStore(COPIES_STORE)
    const index = store.index('controleId')
    const request = index.getAll(controleId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveCopie (copie: CopieEleve): Promise<void> {
  await tx(COPIES_STORE, 'readwrite', (store) => store.put(copie))
}

export async function deleteCopie (id: string): Promise<void> {
  await tx(COPIES_STORE, 'readwrite', (store) => store.delete(id))
}

export async function deleteCopiesByControle (controleId: string): Promise<void> {
  const copies = await getCopiesByControle(controleId)
  const db = await openDB()
  const transaction = db.transaction(COPIES_STORE, 'readwrite')
  const store = transaction.objectStore(COPIES_STORE)
  for (const copie of copies) {
    store.delete(copie.id)
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// ─── Compteurs (pour le dashboard) ────────────────────

export async function countCopiesByControle (controleId: string): Promise<{ total: number; corrected: number }> {
  const copies = await getCopiesByControle(controleId)
  return {
    total: copies.length,
    corrected: copies.filter((c) => c.correction !== null).length,
  }
}
