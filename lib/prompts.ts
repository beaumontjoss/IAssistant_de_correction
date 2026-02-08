export function getTranscriptionPrompt (enonce: string): string {
  return `Tu es un assistant de transcription fidèle. Tu reçois des images d'une copie manuscrite d'élève ainsi que l'énoncé du contrôle.

Ta tâche :
1. Lis attentivement chaque image de la copie
2. Transcris FIDÈLEMENT tout ce que l'élève a écrit, en conservant TOUTES ses erreurs (orthographe, grammaire, conjugaison, contenu)
3. Structure la transcription en Markdown
4. Si un mot ou passage est illisible, écris [illisible]
5. N'inclus JAMAIS le nom de l'élève

ADAPTATION AU TYPE DE COPIE :
- Si l'énoncé contient des questions numérotées ou des exercices, structure la transcription en associant chaque réponse à la question correspondante (## Question 1, ## Question 2, etc.)
- Si la copie est une dissertation ou une rédaction (texte libre continu), structure en paragraphes fidèles, avec des titres comme "## Introduction", "## Développement", "## Conclusion" si l'élève les a écrits, sinon retranscris le texte tel quel en paragraphes
- Si la copie est une dictée, retranscris le texte en un seul bloc, fidèlement, sans structurer en questions
- Pour tout autre type de copie (commentaire de texte, étude de document, exercice de traduction, travail pratique, carte mentale, etc.) : adapte la structure Markdown au format le plus fidèle possible au contenu de l'élève, en respectant l'organisation qu'il a choisie

RÈGLE ABSOLUE : Ne corrige AUCUNE erreur de l'élève. Ta transcription doit être un miroir exact de ce qu'il a écrit.

Format de sortie :
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
    ? `\n\nTu reçois également le corrigé type :\n${corrige}`
    : ''

  return `Tu es un assistant pédagogique expert. Tu reçois l'énoncé d'un contrôle de ${matiere} pour une classe de ${classe}.${corrigeSection}

Ta tâche : propose un barème détaillé et juste.

ADAPTATION AU TYPE D'ÉPREUVE :
- Pour un contrôle avec des questions/exercices : identifie chaque question et attribue des points
- Pour une dissertation : propose des critères comme "Qualité de l'argumentation", "Structure du plan", "Qualité de la langue", "Pertinence des exemples", etc.
- Pour une rédaction/expression écrite : propose des critères comme "Respect de la consigne", "Cohérence du récit", "Richesse du vocabulaire", "Orthographe et grammaire", etc.
- Pour une dictée : propose des critères basés sur le nombre de fautes (orthographe lexicale, grammaticale, conjugaison, accents)
- Pour tout autre type d'épreuve (commentaire de texte, étude de document, exercice de traduction, travail pratique, oral retranscrit, etc.) : analyse l'énoncé et propose des critères d'évaluation pertinents adaptés au format spécifique de l'épreuve

Pour chaque question/critère :
- Identifie la question ou le critère d'évaluation
- Attribue un nombre de points proportionnel à la difficulté et au temps de réponse attendu
- Liste les critères d'évaluation précis (ce qui rapporte des points, ce qui en fait perdre)

Le total de points dépend de l'épreuve (il n'est pas forcément sur 20). Adapte-le au niveau et au type de contrôle.

IMPORTANT : Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après. Pas de bloc markdown.

Format de sortie JSON :
{
  "total": <total adapté à l'épreuve>,
  "questions": [
    {
      "id": "1",
      "titre": "Question 1 - [intitulé] ou Critère : [nom du critère]",
      "points": 4,
      "criteres": [
        "Critère 1 : ... (X pts)",
        "Critère 2 : ... (X pts)"
      ]
    }
  ]
}

Note : chaque item de "questions" peut être une question, un exercice, ou un critère thématique (ex : "Orthographe", "Qualité de l'argumentation", etc.) selon le type d'épreuve.

Énoncé :
${enonce}`
}

export function getCorrectionPrompt (
  matiere: string,
  classe: string,
  severite: string,
  baremeJson: string,
  mdCopie: string,
  corrige?: string
): string {
  const corrigeSection = corrige
    ? `\nCorrigé type :\n${corrige}`
    : ''

  const severiteDescription: Record<string, string> = {
    indulgente: 'Indulgente : tu valorises l\'effort, les réponses partielles rapportent des points, tu es généreux sur l\'interprétation',
    classique: 'Classique : correction standard, équilibrée',
    severe: 'Sévère : tu es exigeant, les réponses doivent être précises et complètes, peu de points pour les réponses partielles',
  }

  return `Tu es un correcteur de copies de ${matiere}, niveau ${classe}. Tu dois corriger la copie d'un élève avec rigueur et bienveillance.

Sévérité de correction : ${severiteDescription[severite] || severiteDescription.classique}

Barème validé :
${baremeJson}
${corrigeSection}

Copie de l'élève (transcription fidèle) :
${mdCopie}

Ta tâche :
1. Évalue chaque question/critère selon le barème
2. Attribue une note par question (pas de demi-points en dessous de 0.5)
3. Calcule la note globale
4. Liste les erreurs/points à corriger avec une explication pédagogique
5. Rédige un commentaire personnalisé bienveillant et constructif

IMPORTANT : Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après. Pas de bloc markdown.

Format de sortie JSON :
{
  "note_globale": 14.5,
  "total": 20,
  "questions": [
    {
      "id": "1",
      "titre": "Question 1",
      "note": 3,
      "points_max": 4,
      "justification": "...",
      "erreurs": ["Erreur 1 : ...", "Erreur 2 : ..."]
    }
  ],
  "points_a_corriger": [
    "Point 1 : explication pédagogique",
    "Point 2 : explication pédagogique"
  ],
  "commentaire": "Commentaire personnalisé bienveillant..."
}`
}
