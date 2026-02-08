import { ControlData, createEmptyControl } from './types'

const STORAGE_KEY = 'iassistant_current'

export function loadControl (): ControlData {
  if (typeof window === 'undefined') return createEmptyControl()
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data) as ControlData
    }
  } catch (err) {
    console.error('Erreur lors du chargement des données:', err)
  }
  return createEmptyControl()
}

export function saveControl (data: ControlData): boolean {
  if (typeof window === 'undefined') return false
  try {
    const json = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, json)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.error('localStorage plein')
      return false
    }
    console.error('Erreur lors de la sauvegarde:', err)
    return false
  }
}

export function clearControl (): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export function getStorageUsage (): { used: number; total: number } {
  if (typeof window === 'undefined') return { used: 0, total: 5 * 1024 * 1024 }
  let used = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      const value = localStorage.getItem(key)
      if (value) {
        used += key.length + value.length
      }
    }
  }
  return { used: used * 2, total: 5 * 1024 * 1024 }
}
