/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tente de parser du JSON depuis une réponse LLM, avec réparation et fallback.
 * Ne lance jamais d'erreur -- renvoie toujours un objet (éventuellement vide).
 */
export function robustJsonParse (raw: string): any {
  // 1. Essai direct
  try {
    return JSON.parse(raw)
  } catch { /* continue */ }

  // 2. Extraire le premier bloc JSON { ... }
  const jsonBlock = raw.match(/\{[\s\S]*\}/)
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock[0])
    } catch { /* continue */ }

    // 3. Réparer les erreurs courantes
    const repaired = repairJson(jsonBlock[0])
    try {
      return JSON.parse(repaired)
    } catch { /* continue */ }
  }

  // 4. Extraire depuis un bloc markdown ```json ... ```
  const markdownBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (markdownBlock) {
    try {
      return JSON.parse(markdownBlock[1])
    } catch {
      const repaired = repairJson(markdownBlock[1])
      try {
        return JSON.parse(repaired)
      } catch { /* continue */ }
    }
  }

  return null
}

/**
 * Répare les erreurs JSON courantes des LLM.
 */
function repairJson (raw: string): string {
  let s = raw

  // Retirer les commentaires // ...
  s = s.replace(/\/\/[^\n]*/g, '')

  // Retirer les virgules traînantes avant } ou ]
  s = s.replace(/,\s*([}\]])/g, '$1')

  // Remplacer les single quotes par des double quotes (hors chaînes)
  s = s.replace(/'/g, '"')

  // Ajouter les accolades/crochets manquants
  const opens = (s.match(/\{/g) || []).length
  const closes = (s.match(/\}/g) || []).length
  if (opens > closes) {
    s += '}'.repeat(opens - closes)
  }

  const openBrackets = (s.match(/\[/g) || []).length
  const closeBrackets = (s.match(/\]/g) || []).length
  if (openBrackets > closeBrackets) {
    s += ']'.repeat(openBrackets - closeBrackets)
  }

  return s
}

/**
 * Valide et normalise un barème parsé depuis un LLM.
 * Garantit la structure { total, questions[] } même si la réponse est bancale.
 */
export function normalizeBareme (parsed: any): { total: number; questions: any[] } {
  if (!parsed) {
    return { total: 0, questions: [] }
  }

  // Extraire les questions depuis différentes clés possibles
  let questions: any[] = []

  if (Array.isArray(parsed.questions)) {
    questions = parsed.questions
  } else if (Array.isArray(parsed.exercices)) {
    questions = parsed.exercices
  } else if (Array.isArray(parsed.items)) {
    questions = parsed.items
  } else if (Array.isArray(parsed.criteres)) {
    questions = parsed.criteres
  } else if (Array.isArray(parsed.bareme)) {
    questions = parsed.bareme
  } else if (Array.isArray(parsed)) {
    questions = parsed
  }

  // Normaliser chaque question
  const normalized = questions.map((q: any, i: number) => ({
    id: String(q.id || q.numero || i + 1),
    titre: q.titre || q.title || q.question || q.nom || q.name || q.intitule || `Item ${i + 1}`,
    points: Number(q.points || q.note_max || q.max || q.bareme || 0),
    criteres: normalizeCriteres(q),
  }))

  // Calculer le total
  const total = parsed.total
    ? Number(parsed.total)
    : normalized.reduce((sum: number, q: any) => sum + q.points, 0)

  return { total, questions: normalized }
}

/**
 * Extrait les critères depuis un item de barème, quel que soit le format.
 */
function normalizeCriteres (q: any): string[] {
  if (Array.isArray(q.criteres)) {
    return q.criteres.map((c: any) => typeof c === 'string' ? c : c.description || c.critere || c.label || JSON.stringify(c))
  }
  if (Array.isArray(q.criteria)) {
    return q.criteria.map((c: any) => typeof c === 'string' ? c : c.description || JSON.stringify(c))
  }
  if (Array.isArray(q.details)) {
    return q.details.map((d: any) => typeof d === 'string' ? d : JSON.stringify(d))
  }
  if (typeof q.description === 'string') {
    return [q.description]
  }
  if (typeof q.justification === 'string') {
    return [q.justification]
  }
  return ['Critère à préciser']
}

/**
 * Valide et normalise une correction parsée depuis un LLM.
 * Garantit la structure attendue même si la réponse est bancale.
 */
export function normalizeCorrection (parsed: any): any | null {
  if (!parsed) return null

  let questions: any[] = []
  if (Array.isArray(parsed.questions)) {
    questions = parsed.questions
  } else if (Array.isArray(parsed.resultats)) {
    questions = parsed.resultats
  } else if (Array.isArray(parsed.notes)) {
    questions = parsed.notes
  }

  const normalized = questions.map((q: any, i: number) => ({
    id: String(q.id || i + 1),
    titre: q.titre || q.title || q.question || `Item ${i + 1}`,
    note: Number(q.note ?? q.score ?? q.points ?? 0),
    points_max: Number(q.points_max ?? q.max ?? q.bareme ?? q.sur ?? 0),
    justification: q.justification || q.commentaire || q.explication || '',
    erreurs: Array.isArray(q.erreurs) ? q.erreurs
      : Array.isArray(q.errors) ? q.errors
        : [],
  }))

  const noteGlobale = parsed.note_globale ?? parsed.note ?? parsed.total_eleve
    ?? normalized.reduce((s: number, q: any) => s + q.note, 0)

  const total = parsed.total ?? parsed.sur ?? parsed.note_max
    ?? normalized.reduce((s: number, q: any) => s + q.points_max, 0)

  return {
    note_globale: Number(noteGlobale),
    total: Number(total),
    questions: normalized,
    points_a_corriger: Array.isArray(parsed.points_a_corriger) ? parsed.points_a_corriger
      : Array.isArray(parsed.points_amelioration) ? parsed.points_amelioration
        : [],
    commentaire: parsed.commentaire || parsed.comment || parsed.appreciation || '',
  }
}
