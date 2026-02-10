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
 * Garantit la structure { total, questions[] } avec critères structurés.
 */
export function normalizeBareme (parsed: any): { total: number; questions: any[] } {
  if (!parsed) {
    return { total: 0, questions: [] }
  }

  // Extraire les sections depuis différentes clés possibles
  let sections: any[] = []

  // Chercher dans les clés connues (tableau ou objet)
  const candidates = [
    parsed.questions, parsed.sections, parsed.exercices,
    parsed.items, parsed.bareme, parsed['barème'],
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      sections = candidate
      break
    }
    // Format objet : détecter si c'est un wrapper ou un vrai objet-sections
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      // Cas 1 : wrapper { total_points, sections: [...] } ou { total, questions: [...] } (ex: GPT-4o Mini)
      const innerArrayKeys = ['questions', 'sections', 'exercices', 'items']
      const innerArray = innerArrayKeys
        .map((k) => candidate[k])
        .find((v) => Array.isArray(v) && v.length > 0)

      if (innerArray) {
        sections = innerArray
        break
      }

      // Cas 2 : catégories { "Grammaire": { total, questions: [...] }, "Compréhension": { ... } } (ex: Mistral)
      const values = Object.values(candidate)
      const hasNestedQuestions = values.every((v: any) =>
        v && typeof v === 'object' && !Array.isArray(v) &&
        innerArrayKeys.some((k) => Array.isArray(v[k]))
      )
      if (hasNestedQuestions) {
        // Aplatir : extraire toutes les questions de chaque catégorie
        for (const val of values) {
          const arr = innerArrayKeys.map((k) => (val as any)[k]).find((v) => Array.isArray(v)) || []
          sections.push(...arr)
        }
        break
      }

      // Cas 3 : vrai objet { "titre question": { critères, points } } (ex: Mistral simple)
      sections = Object.entries(candidate).map(([titre, value]: [string, any]) => ({
        titre,
        ...(typeof value === 'object' ? value : {}),
      }))
      break
    }
  }

  if (sections.length === 0 && Array.isArray(parsed)) {
    // Cas spécial : tableau à 1 élément qui est un objet multi-clés (ex: Gemini Flash)
    // [{ "Q1 titre": {Points, Critères}, "Q2 titre": {...} }]
    if (parsed.length === 1 && typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
      const keys = Object.keys(parsed[0])
      if (keys.length > 1 && typeof parsed[0][keys[0]] === 'object') {
        sections = keys.map((titre) => ({ titre, ...parsed[0][titre] }))
      } else {
        sections = parsed
      }
    } else {
      sections = parsed
    }
  }

  // Déplier les questions au format { "titre": { points, critères } } (ex: Mistral deeply nested)
  // Chaque élément du tableau est un objet à 1 clé dont la valeur est un objet avec points/critères
  const flatSections = sections.flatMap((q: any) => {
    // Si l'élément a exactement 1 clé et sa valeur est un objet avec points ou critères → déplier
    const keys = Object.keys(q)
    if (keys.length === 1 && typeof q[keys[0]] === 'object' && !Array.isArray(q[keys[0]])) {
      const inner = q[keys[0]]
      if (inner.points !== undefined || inner['critères'] || inner.criteres || inner.criteria) {
        return [{ titre: keys[0], ...inner }]
      }
    }
    return [q]
  })

  // Normaliser chaque section
  const normalized = flatSections.map((q: any, i: number) => {
    const criteres = normalizeCriteres(q)
    const criteresSum = criteres.reduce((sum: number, c: any) => sum + (c.points || 0), 0)
    // Utiliser la somme des critères, ou le champ points de la section en fallback
    const points = criteresSum > 0 ? criteresSum : Number(q.points || q.Points || q.total || q.note_max || q.max || 0)

    return {
      id: String(q.id || q.numero || i + 1),
      titre: q.titre || q.title || q.section || q.nom || q.name || q.intitule || `Section ${i + 1}`,
      points,
      criteres,
    }
  })

  // Calculer le total
  const rawTotal = parsed.total ?? parsed.total_points ?? parsed.totalPoints ?? parsed.note_totale ?? parsed['total_général'] ?? parsed['total_general']
  const total = rawTotal
    ? Number(rawTotal)
    : normalized.reduce((sum: number, q: any) => sum + q.points, 0)

  return { total, questions: normalized }
}

/**
 * Extrait et normalise les critères depuis un item de barème.
 * Retourne toujours un tableau de { question, description, points }.
 * Gère l'ancien format (string[]) et le nouveau (BaremeCritere[]).
 */
function normalizeCriteres (q: any): Array<{ question: string; description: string; points: number }> {
  const raw = q.criteres || q['critères'] || q.criteria || q.details || q.Criteres || q['Critères'] || q.Criteria

  // Format objet { "description": points } (ex: Mistral) ou { "0": "desc string", "1": "desc string" } (ex: GPT)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw)
    // Détecter si les valeurs sont des nombres (Mistral) ou des strings (GPT)
    const hasNumValues = entries.some(([, v]) => typeof v === 'number' && v > 0)

    if (hasNumValues) {
      // Format { "description critère": points_number }
      const result = entries
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([desc, pts]: [string, any]) => ({
          question: '',
          description: desc,
          points: Number(pts),
        }))
      if (result.length > 0) return result
    }

    // Format { "0": "Réponse correcte : 2 pts", "1": "..." } ou { key: "string desc" }
    const stringEntries = entries.filter(([, v]) => typeof v === 'string')
    if (stringEntries.length > 0) {
      return stringEntries.map(([, desc]: [string, any]) => {
        const ptsMatch = String(desc).match(/(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)/i)
        const pts = ptsMatch ? Number(ptsMatch[1].replace(',', '.')) : 0
        return { question: '', description: String(desc), points: pts }
      })
    }

    // Catch-all : objet avec valeurs numériques (y compris 0) — ex: { "desc": 0, "desc2": 0 }
    // Retourner toutes les entrées comme critères
    if (entries.length > 0) {
      return entries.map(([desc, val]: [string, any]) => ({
        question: '',
        description: desc,
        points: typeof val === 'number' ? val : 0,
      }))
    }
  }

  if (!raw || (!Array.isArray(raw) && typeof raw !== 'object') || (Array.isArray(raw) && raw.length === 0)) {
    // Pas de critères structurés — créer un critère unique depuis la question elle-même
    const desc = q.description || q.question || q.titre || q.title || q.section || 'Critère à préciser'
    const pts = Number(q.points || q.Points || q.total || q.note_max || q.max || 0)
    return [{ question: '', description: typeof desc === 'string' ? desc : String(desc), points: pts }]
  }

  return raw.map((c: any) => {
    // Ancien format : critère = string simple
    if (typeof c === 'string') {
      // Tenter d'extraire les points depuis le texte, ex: "Critère 1 (2 pts)"
      const ptsMatch = c.match(/\((\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\)/i)
      const pts = ptsMatch ? Number(ptsMatch[1].replace(',', '.')) : 0
      return { question: '', description: c, points: pts }
    }

    // Nouveau format : critère = objet — garantir que tous les champs existent
    return {
      question: String(c.question ?? c.ref ?? c.numero ?? ''),
      description: String(c.description ?? c.critere ?? c.label ?? c.titre ?? c.text ?? ''),
      points: Number(c.points ?? c.pts ?? c.note_max ?? 0),
    }
  })
}

/**
 * Valide et normalise une correction parsée depuis un LLM.
 * Garantit la structure attendue même si la réponse est bancale.
 * Si un barème est fourni, aligne les questions de la correction avec celles du barème
 * (ajoute les manquantes, corrige les points_max, recalcule les totaux).
 */
export function normalizeCorrection (parsed: any, baremeJson?: string): any | null {
  if (!parsed) return null

  let questions: any[] = []
  if (Array.isArray(parsed.questions)) {
    questions = parsed.questions
  } else if (Array.isArray(parsed.resultats)) {
    questions = parsed.resultats
  } else if (Array.isArray(parsed['résultats'])) {
    questions = parsed['résultats']
  } else if (Array.isArray(parsed.notes)) {
    questions = parsed.notes
  } else if (Array.isArray(parsed.corrections)) {
    questions = parsed.corrections
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

  // ─── Aligner avec le barème si fourni ───
  let aligned = normalized
  let expectedTotal = 0

  if (baremeJson) {
    try {
      const bareme = JSON.parse(baremeJson)
      const baremeQuestions: any[] = bareme.questions || []
      expectedTotal = Number(bareme.total || 0)

      if (baremeQuestions.length > 0) {
        aligned = baremeQuestions.map((bq: any) => {
          const bId = String(bq.id)
          const bTitre = bq.titre || ''
          const bPoints = Number(bq.points || 0)

          // Chercher la correspondance dans la correction du LLM
          // 1) par id exact
          let match = normalized.find((n: any) => String(n.id) === bId)

          // 2) par titre similaire (au cas où le LLM a changé l'id)
          if (!match) {
            match = normalized.find((n: any) =>
              n.titre && bTitre &&
              (n.titre.toLowerCase().includes(bTitre.toLowerCase().substring(0, 20)) ||
               bTitre.toLowerCase().includes(n.titre.toLowerCase().substring(0, 20)))
            )
          }

          if (match) {
            return {
              id: bId,
              titre: bTitre,
              note: Math.min(Number(match.note), bPoints), // Plafond au max
              points_max: bPoints,
              justification: match.justification || '',
              erreurs: match.erreurs || [],
            }
          }

          // Section non trouvée dans la réponse du LLM → noter 0
          return {
            id: bId,
            titre: bTitre,
            note: 0,
            points_max: bPoints,
            justification: 'Non évalué par le modèle.',
            erreurs: [],
          }
        })
      }
    } catch {
      // Barème invalide — on garde la normalisation brute
    }
  }

  // Recalculer les totaux depuis les questions alignées
  const noteGlobale = aligned.reduce((s: number, q: any) => s + q.note, 0)
  const total = expectedTotal > 0
    ? expectedTotal
    : (parsed.total ?? parsed.total_points ?? parsed.sur ?? parsed.note_max ?? aligned.reduce((s: number, q: any) => s + q.points_max, 0))

  return {
    note_globale: Number(noteGlobale),
    total: Number(total),
    questions: aligned,
    points_a_corriger: Array.isArray(parsed.points_a_corriger) ? parsed.points_a_corriger
      : Array.isArray(parsed.points_amelioration) ? parsed.points_amelioration
        : [],
    commentaire: parsed.commentaire || parsed.comment || parsed.appreciation || '',
  }
}
