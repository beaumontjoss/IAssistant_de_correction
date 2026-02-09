export function getTranscriptionPrompt (enonce: string): string {
  return `Tu es un assistant de transcription fidèle. Tu reçois des images d'une copie manuscrite d'élève ainsi que l'énoncé du contrôle.

Ta tâche :
1. Lis attentivement chaque image de la copie
2. Si le nom et/ou prénom de l'élève est visible sur la copie (en-tête, haut de page, page de garde, cartouche), indique-le sur la TOUTE PREMIÈRE LIGNE au format exact : NOM: Prénom Nom
   Si aucun nom n'est visible, ne mets pas de ligne NOM.
3. Transcris FIDÈLEMENT tout ce que l'élève a écrit, en conservant TOUTES ses erreurs (orthographe, grammaire, conjugaison, contenu)
4. Structure la transcription en Markdown
5. Si un mot ou passage est illisible, écris [illisible]
6. N'inclus PAS le nom de l'élève dans le corps de la transcription (seulement dans la ligne NOM: au début)

ADAPTATION AU TYPE DE COPIE :
- Si l'énoncé contient des questions numérotées ou des exercices, structure la transcription en associant chaque réponse à la question correspondante (## Question 1, ## Question 2, etc.)
- Si la copie est une dissertation ou une rédaction (texte libre continu), structure en paragraphes fidèles, avec des titres comme "## Introduction", "## Développement", "## Conclusion" si l'élève les a écrits, sinon retranscris le texte tel quel en paragraphes
- Si la copie est une dictée, retranscris le texte en un seul bloc, fidèlement, sans structurer en questions
- Pour tout autre type de copie (commentaire de texte, étude de document, exercice de traduction, travail pratique, carte mentale, etc.) : adapte la structure Markdown au format le plus fidèle possible au contenu de l'élève, en respectant l'organisation qu'il a choisie

RÈGLE ABSOLUE : Ne corrige AUCUNE erreur de l'élève. Ta transcription doit être un miroir exact de ce qu'il a écrit.

Format de sortie :
NOM: Prénom Nom
# Copie de l'élève

[Contenu structuré selon le type de copie détecté]

Énoncé du contrôle :
${enonce}`
}

export function getStructurationPrompt (texteOcr: string, enonce: string): string {
  return `Tu es un assistant de structuration. Tu reçois le texte brut extrait par OCR d'une copie manuscrite d'élève, ainsi que l'énoncé du contrôle.

Ta tâche :
1. Structure ce texte brut en Markdown
2. Conserve TOUTES les erreurs présentes dans le texte OCR (orthographe, grammaire, etc.)
3. Ne corrige AUCUNE erreur, ne reformule RIEN
4. Si le texte OCR contient des artefacts évidents de reconnaissance (caractères aberrants isolés), tu peux les nettoyer, mais UNIQUEMENT s'il est évident que c'est une erreur OCR et non une erreur de l'élève
5. Si un passage est incohérent et pourrait être une erreur OCR ou une erreur d'élève, conserve-le tel quel

ADAPTATION AU TYPE DE COPIE :
- Si l'énoncé contient des questions numérotées ou des exercices, associe chaque réponse à la question correspondante (## Question 1, ## Question 2, etc.)
- Si la copie est une dissertation ou une rédaction, structure en paragraphes fidèles, sans découper artificiellement le texte
- Si la copie est une dictée, retranscris en un seul bloc continu
- Pour tout autre type de copie (commentaire de texte, étude de document, exercice de traduction, travail pratique, etc.) : adapte la structure au format le plus fidèle possible au contenu original

Format de sortie :
# Copie de l'élève

[Contenu structuré selon le type de copie]

Texte brut OCR :
${texteOcr}

Énoncé du contrôle :
${enonce}`
}

export function getBaremePrompt (matiere: string, classe: string, enonce: string, corrige?: string): string {
  const corrigeSection = corrige
    ? `\n\n<corrige>\n${corrige}\n</corrige>`
    : ''

  return `Tu es un assistant pédagogique expert. Ta tâche : proposer un barème détaillé et juste pour un contrôle de ${matiere} (classe de ${classe}).

RÈGLE FONDAMENTALE DE GRANULARITÉ :
- Crée UNE section par question ou sous-question du contrôle (ex : "1a)", "1b)", "1c)", "2)", "3)", etc.)
- NE REGROUPE JAMAIS plusieurs questions dans une même section (pas de "Grammaire", "Compréhension", etc.)
- Chaque section = une question que le professeur corrigera individuellement sur la copie
- Le titre de chaque section doit décrire précisément ce que la question demande (ex : "Identifier le groupe COD de « savourait »", "Réécrire au pluriel", etc.)
- Exception : pour une dissertation, rédaction ou dictée (pas de questions numérotées), utilise des critères thématiques

ADAPTATION AU TYPE D'ÉPREUVE :
- Contrôle avec questions/exercices : UNE section par question/sous-question. Si la question 1 a trois sous-parties a), b), c) → 3 sections séparées
- Dissertation : critères thématiques (argumentation, structure, langue, exemples)
- Rédaction/expression écrite : critères thématiques (consigne, cohérence, vocabulaire, orthographe)
- Dictée : critères par type de faute (orthographe lexicale, grammaticale, conjugaison, accents)

Pour chaque section :
- Le titre décrit précisément la question posée
- Les critères détaillent ce qui rapporte ou fait perdre des points
- Les points sont proportionnels à la difficulté

Le total de points dépend de l'épreuve (pas forcément sur 20). Adapte-le au niveau et au type de contrôle.

Réponds UNIQUEMENT avec du JSON valide.

<enonce>
${enonce}
</enonce>${corrigeSection}`
}

/**
 * Schéma JSON pour les structured outputs Anthropic (barème).
 * Utilisé avec output_config.format pour garantir un JSON valide.
 */
export const BAREME_JSON_SCHEMA = {
  type: 'object',
  properties: {
    total: { type: 'number', description: 'Total de points du barème' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identifiant de la question (ex: "1a", "2")' },
          titre: { type: 'string', description: 'Description précise de la question' },
          criteres: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'Référence à la sous-question (ex: "1)a)") ou vide' },
                description: { type: 'string', description: 'Ce que le critère évalue' },
                points: { type: 'number', description: 'Points attribués' },
              },
              required: ['question', 'description', 'points'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'titre', 'criteres'],
        additionalProperties: false,
      },
    },
  },
  required: ['total', 'questions'],
  additionalProperties: false,
}

/**
 * Schéma JSON pour les structured outputs Anthropic (correction).
 */
export const CORRECTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    note_globale: { type: 'number', description: 'Note totale attribuée à la copie' },
    total: { type: 'number', description: 'Total de points du barème' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identifiant de la question (correspondant au barème)' },
          titre: { type: 'string', description: 'Titre de la question' },
          note: { type: 'number', description: 'Points attribués pour cette question' },
          points_max: { type: 'number', description: 'Points maximum pour cette question' },
          justification: { type: 'string', description: 'Explication détaillée de la note' },
          erreurs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des erreurs identifiées',
          },
        },
        required: ['id', 'titre', 'note', 'points_max', 'justification', 'erreurs'],
        additionalProperties: false,
      },
    },
    points_a_corriger: {
      type: 'array',
      items: { type: 'string' },
      description: 'Conseils d\'amélioration pour l\'élève',
    },
    commentaire: { type: 'string', description: 'Commentaire global sur la copie' },
  },
  required: ['note_globale', 'total', 'questions', 'points_a_corriger', 'commentaire'],
  additionalProperties: false,
}

export interface PreviousCorrection {
  nom_eleve: string
  note_globale: number
  total: number
  questions: Array<{
    titre: string
    note: number
    points_max: number
    justification: string
  }>
}

/**
 * Retourne le prompt de correction séparé en deux parties :
 * - staticContext : contenu identique pour toutes les copies d'un contrôle (cacheable)
 * - variableContext : contenu spécifique à chaque copie (non caché)
 */
export function getCorrectionPromptParts (
  matiere: string,
  classe: string,
  severite: string,
  baremeJson: string,
  mdCopie: string,
  enonce?: string,
  corrige?: string,
  previousCorrections?: PreviousCorrection[]
): { staticContext: string; variableContext: string } {
  const severiteDescription: Record<string, string> = {
    indulgente: 'Indulgente : tu valorises l\'effort, les réponses partielles rapportent des points, tu es généreux sur l\'interprétation',
    classique: 'Classique : correction standard, équilibrée',
    severe: 'Sévère : tu es exigeant, les réponses doivent être précises et complètes, peu de points pour les réponses partielles',
  }

  // ─── Générer la structure attendue dynamiquement depuis le barème ───
  const { sectionsList, exampleJson, evaluationInstructions } = buildBaremeStructure(baremeJson)

  const hasPrevious = previousCorrections && previousCorrections.length > 0

  // ─── Partie statique (identique pour toutes les copies du contrôle) ───
  const enonceSection = enonce
    ? `\nÉnoncé du contrôle :\n${enonce}\n`
    : ''

  const corrigeSection = corrige
    ? `\nCorrigé type :\n${corrige}\n`
    : ''

  const staticContext = `Tu es un correcteur de copies de ${matiere}, niveau ${classe}. Tu dois corriger la copie d'un élève avec rigueur et bienveillance.

Sévérité de correction : ${severiteDescription[severite] || severiteDescription.classique}
${enonceSection}${corrigeSection}
Barème validé :
${baremeJson}

STRUCTURE ATTENDUE DE TA RÉPONSE :
Tu DOIS évaluer CHAQUE section du barème et retourner dans "questions" EXACTEMENT les entrées suivantes, dans cet ordre, avec les mêmes id et titre :

${sectionsList}

${evaluationInstructions}

Ta tâche :
1. Évalue CHAQUE section listée ci-dessus — n'en oublie aucune, n'en fusionne aucune
2. Pour chaque section, attribue une note entre 0 et points_max (demi-points autorisés ≥ 0.5)
3. Justifie chaque note en détail
4. Liste les erreurs commises pour chaque section
5. Calcule la note globale = somme des notes de toutes les sections
6. Rédige un commentaire personnalisé bienveillant et constructif
7. Liste les points pédagogiques à travailler
${hasPrevious ? '8. Assure la cohérence avec les corrections précédentes : même exigence, même barème appliqué\n' : ''}
IMPORTANT : Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après. Pas de bloc markdown.

Format de sortie JSON EXACT :
${exampleJson}`

  // ─── Partie variable (spécifique à chaque copie) ───
  let previousSection = ''
  if (hasPrevious) {
    const summaries = previousCorrections.map((pc) => {
      const questionsDetail = pc.questions
        .map((q) => `  - ${q.titre} : ${q.note}/${q.points_max} — ${q.justification}`)
        .join('\n')
      return `### ${pc.nom_eleve} — ${pc.note_globale}/${pc.total}\n${questionsDetail}`
    }).join('\n\n')

    previousSection = `CORRECTIONS PRÉCÉDENTES (pour assurer l'équité de notation) :
Les copies suivantes ont déjà été corrigées pour ce même contrôle. Tu DOIS maintenir une cohérence de notation avec ces évaluations. Pour un même niveau de réponse, attribue un nombre de points similaire. Sois juste et équitable entre les élèves.

${summaries}

`
  }

  const variableContext = `${previousSection}Copie de l'élève (transcription fidèle) :
${mdCopie}`

  return { staticContext, variableContext }
}

/** Rétrocompatibilité : retourne le prompt complet en une seule chaîne */
export function getCorrectionPrompt (
  matiere: string,
  classe: string,
  severite: string,
  baremeJson: string,
  mdCopie: string,
  enonce?: string,
  corrige?: string,
  previousCorrections?: PreviousCorrection[]
): string {
  const { staticContext, variableContext } = getCorrectionPromptParts(
    matiere, classe, severite, baremeJson, mdCopie, enonce, corrige, previousCorrections
  )
  return `${staticContext}\n\n${variableContext}`
}

/**
 * Parse le barème JSON et génère la structure dynamique pour le prompt.
 */
function buildBaremeStructure (baremeJson: string): {
  sectionsList: string
  exampleJson: string
  evaluationInstructions: string
} {
  let bareme: { total?: number; questions?: Array<{ id: string; titre: string; points: number; criteres?: Array<{ question: string; description: string; points: number }> }> }

  try {
    bareme = JSON.parse(baremeJson)
  } catch {
    // Fallback si le JSON est invalide
    return {
      sectionsList: '- (barème non parsable — évalue au mieux)',
      exampleJson: '{\n  "note_globale": 0,\n  "total": 20,\n  "questions": [],\n  "points_a_corriger": [],\n  "commentaire": ""\n}',
      evaluationInstructions: '',
    }
  }

  const sections = bareme.questions ?? []
  const total = bareme.total ?? sections.reduce((s, q) => s + (q.points || 0), 0)

  // Détecter le type d'épreuve
  const hasQuestionRefs = sections.some((s) =>
    (s.criteres ?? []).some((c) => c.question && c.question.trim() !== '')
  )

  // ─── Liste des sections attendues ───
  const sectionsList = sections.map((s) => {
    const criteresList = (s.criteres ?? []).map((c) => {
      const ref = c.question && c.question.trim() ? `[${c.question}] ` : ''
      return `    · ${ref}${c.description} (${c.points} pt${c.points > 1 ? 's' : ''})`
    }).join('\n')

    return `- id: "${s.id}", titre: "${s.titre}", points_max: ${s.points}\n${criteresList}`
  }).join('\n\n')

  // ─── Instructions adaptées au type d'épreuve ───
  let evaluationInstructions = ''
  if (hasQuestionRefs) {
    evaluationInstructions = `POUR CHAQUE SECTION (contrôle avec questions) :
- Identifie la réponse de l'élève correspondant à chaque question/sous-question
- Évalue chaque critère individuellement
- La note de la section = somme des points obtenus sur ses critères
- Si l'élève n'a pas répondu à une question, attribue 0 et mentionne "Non traité" dans les erreurs`
  } else {
    evaluationInstructions = `POUR CHAQUE SECTION (évaluation thématique — dissertation, dictée, rédaction, etc.) :
- Évalue la copie DANS SON ENSEMBLE au regard de chaque critère thématique
- Ne cherche pas des "réponses" à des questions, mais évalue la qualité globale de la copie pour chaque axe
- La note de la section reflète le niveau de l'élève sur ce critère transversal
- Justifie en citant des passages ou exemples concrets tirés de la copie`
  }

  // ─── Exemple JSON dynamique ───
  const questionsExample = sections.map((s) => {
    return `    {
      "id": "${s.id}",
      "titre": "${s.titre}",
      "note": 0,
      "points_max": ${s.points},
      "justification": "[Justification détaillée]",
      "erreurs": ["[Erreur ou point à améliorer]"]
    }`
  }).join(',\n')

  const exampleJson = `{
  "note_globale": 0,
  "total": ${total},
  "questions": [
${questionsExample}
  ],
  "points_a_corriger": [
    "[Point pédagogique 1]",
    "[Point pédagogique 2]"
  ],
  "commentaire": "[Commentaire personnalisé bienveillant]"
}`

  return { sectionsList, exampleJson, evaluationInstructions }
}
