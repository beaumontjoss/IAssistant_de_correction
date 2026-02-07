export function getTranscriptionPrompt (enonce: string): string {
  return `Tu es un assistant de transcription fidele. Tu recois des images d'une copie manuscrite d'eleve ainsi que l'enonce du controle.

Ta tache :
1. Lis attentivement chaque image de la copie
2. Transcris FIDELEMENT tout ce que l'eleve a ecrit, en conservant TOUTES ses erreurs (orthographe, grammaire, conjugaison, contenu)
3. Structure la transcription en Markdown en associant chaque reponse a la question correspondante de l'enonce
4. Si un mot ou passage est illisible, ecris [illisible]
5. N'inclus JAMAIS le nom de l'eleve

REGLE ABSOLUE : Ne corrige AUCUNE erreur de l'eleve. Ta transcription doit etre un miroir exact de ce qu'il a ecrit, structure par question.

Format de sortie :
# Copie de l'eleve

## Question 1 : [intitule court de la question]
[reponse de l'eleve, fidelement transcrite]

## Question 2 : [intitule court de la question]
[reponse de l'eleve, fidelement transcrite]

...

Enonce du controle :
${enonce}`
}

export function getStructurationPrompt (texteOcr: string, enonce: string): string {
  return `Tu es un assistant de structuration. Tu recois le texte brut extrait par OCR d'une copie manuscrite d'eleve, ainsi que l'enonce du controle.

Ta tache :
1. Structure ce texte brut en Markdown en associant chaque reponse a la question correspondante de l'enonce
2. Conserve TOUTES les erreurs presentes dans le texte OCR (orthographe, grammaire, etc.)
3. Ne corrige AUCUNE erreur, ne reformule RIEN
4. Si le texte OCR contient des artefacts evidents de reconnaissance (caracteres aberrants isoles), tu peux les nettoyer, mais UNIQUEMENT s'il est evident que c'est une erreur OCR et non une erreur de l'eleve
5. Si un passage est incoherent et pourrait etre une erreur OCR ou une erreur d'eleve, conserve-le tel quel

Format de sortie :
# Copie de l'eleve

## Question 1 : [intitule court de la question]
[reponse de l'eleve, fidelement transcrite]

## Question 2 : [intitule court de la question]
[reponse de l'eleve, fidelement transcrite]

...

Texte brut OCR :
${texteOcr}

Enonce du controle :
${enonce}`
}

export function getBaremePrompt (matiere: string, classe: string, enonce: string, corrige?: string): string {
  const corrigeSection = corrige
    ? `\n\nTu recois egalement le corrige type :\n${corrige}`
    : ''

  return `Tu es un assistant pedagogique expert. Tu recois l'enonce d'un controle de ${matiere} pour une classe de ${classe}.${corrigeSection}

Ta tache : propose un bareme detaille et juste.

Pour chaque question/exercice :
- Identifie la question
- Attribue un nombre de points proportionnel a la difficulte et au temps de reponse attendu
- Liste les criteres d'evaluation precis (ce qui rapporte des points, ce qui en fait perdre)

IMPORTANT : Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres. Pas de bloc markdown.

Format de sortie JSON :
{
  "total": 20,
  "questions": [
    {
      "id": "1",
      "titre": "Question 1 - [intitule]",
      "points": 4,
      "criteres": [
        "Critere 1 : ... (X pts)",
        "Critere 2 : ... (X pts)"
      ]
    }
  ]
}

Enonce :
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
    ? `\nCorrige type :\n${corrige}`
    : ''

  const severiteDescription: Record<string, string> = {
    indulgente: 'Indulgente : tu valorises l\'effort, les reponses partielles rapportent des points, tu es genereux sur l\'interpretation',
    classique: 'Classique : correction standard, equilibree',
    severe: 'Severe : tu es exigeant, les reponses doivent etre precises et completes, peu de points pour les reponses partielles',
  }

  return `Tu es un correcteur de copies de ${matiere}, niveau ${classe}. Tu dois corriger la copie d'un eleve avec rigueur et bienveillance.

Severite de correction : ${severiteDescription[severite] || severiteDescription.classique}

Bareme valide :
${baremeJson}
${corrigeSection}

Copie de l'eleve (transcription fidele) :
${mdCopie}

Ta tache :
1. Evalue chaque question selon le bareme et les criteres
2. Attribue une note par question (pas de demi-points en dessous de 0.5)
3. Calcule la note globale
4. Liste les erreurs/points a corriger avec une explication pedagogique
5. Redige un commentaire personnalise bienveillant et constructif

IMPORTANT : Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres. Pas de bloc markdown.

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
    "Point 1 : explication pedagogique",
    "Point 2 : explication pedagogique"
  ],
  "commentaire": "Commentaire personnalise bienveillant..."
}`
}
