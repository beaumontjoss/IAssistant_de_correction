import { ControlData, createEmptyControl } from './types'
import type { BaremeCritere } from './types'

const STORAGE_KEY = 'iassistant_current'

/**
 * Migre les anciens critères (string[]) vers le nouveau format (BaremeCritere[]).
 */
function migrateBareme (data: ControlData): ControlData {
  if (!data.bareme?.questions) return data

  let needsMigration = false

  const migratedQuestions = data.bareme.questions.map((q) => {
    if (!Array.isArray(q.criteres) || q.criteres.length === 0) {
      return { ...q, criteres: [{ question: '', description: 'Critère à préciser', points: q.points || 0 }] as BaremeCritere[] }
    }

    // Vérifier si c'est l'ancien format (string[])
    if (typeof q.criteres[0] === 'string') {
      needsMigration = true
      const totalPoints = q.points || 0
      const pointsPerCritere = q.criteres.length > 0 ? Math.round((totalPoints / q.criteres.length) * 2) / 2 : 0

      const migratedCriteres: BaremeCritere[] = (q.criteres as unknown as string[]).map((c) => {
        // Tenter d'extraire les points depuis le texte, ex: "Critère (2 pts)"
        const ptsMatch = c.match(/\((\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\)/i)
        const pts = ptsMatch ? Number(ptsMatch[1].replace(',', '.')) : pointsPerCritere
        return { question: '', description: c, points: pts }
      })

      return { ...q, criteres: migratedCriteres }
    }

    return q
  })

  if (needsMigration) {
    console.info('Migration du barème vers le nouveau format BaremeCritere[]')
  }

  return { ...data, bareme: { ...data.bareme, questions: migratedQuestions } }
}

export function loadControl (): ControlData {
  if (typeof window === 'undefined') return createEmptyControl()
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data) as ControlData
      return migrateBareme(parsed)
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
