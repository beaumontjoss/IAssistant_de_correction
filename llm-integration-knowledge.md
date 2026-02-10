# Knowledge Base — Intégration multi-LLM pour le parsing JSON structuré

> **Contexte** : application Next.js qui appelle plusieurs LLMs (Anthropic, OpenAI, Google Gemini, DeepSeek, Mistral) pour générer et parser du JSON structuré à partir de contenus multimodaux (images + texte).
>
> Ce document recense les pièges, formats de réponse, et solutions éprouvées pour chaque provider. Il est réutilisable pour tout projet qui consomme plusieurs APIs LLM et attend du JSON en sortie.

---

## Table des matières

1. [Vue d'ensemble des providers](#1-vue-densemble-des-providers)
2. [Anthropic (Claude)](#2-anthropic-claude)
3. [OpenAI (GPT)](#3-openai-gpt)
4. [Google Gemini](#4-google-gemini)
5. [DeepSeek](#5-deepseek)
6. [Mistral](#6-mistral)
7. [Parsing JSON robuste — Stratégie universelle](#7-parsing-json-robuste--stratégie-universelle)
8. [Normalisation des structures JSON](#8-normalisation-des-structures-json)
9. [Prompt caching](#9-prompt-caching)
10. [Multimodalité (images)](#10-multimodalité-images)
11. [Déploiement Vercel](#11-déploiement-vercel)
12. [Checklist d'intégration d'un nouveau LLM](#12-checklist-dintégration-dun-nouveau-llm)

---

## 1. Vue d'ensemble des providers

| Provider | Modèles testés | Multimodal | JSON natif | Particularités majeures |
|----------|---------------|:----------:|:----------:|------------------------|
| Anthropic | claude-opus-4-6, claude-haiku-4-5 | Oui | Partiel (structured output) | Adaptive thinking sur Opus 4.6 |
| OpenAI | gpt-4o-mini, gpt-5.2, gpt-5.2-pro | Oui | Oui (`response_format`) | gpt-5.2-pro utilise `/v1/responses` |
| Google | gemini-3-flash, gemini-3-pro | Oui | Oui (`responseMimeType`) | Risque de `RECITATION` block |
| DeepSeek | deepseek-v3.2 (deepseek-chat) | Non | Oui (`response_format`) | Text-only, pas d'images |
| Mistral | mistral-large (mistral-large-2512) | Oui | Oui (`response_format`) | Rate limits agressifs |

---

## 2. Anthropic (Claude)

### 2.1 Endpoint et authentification

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: <ANTHROPIC_API_KEY>
  anthropic-version: 2023-06-01
```

### 2.2 Adaptive thinking (Opus 4.6)

**Problème critique** : Opus 4.6 utilise l'adaptive thinking par défaut. La réponse contient **plusieurs content blocks** dans un ordre imprévisible :

```json
{
  "content": [
    { "type": "text", "text": "\n\n" },           // bloc texte VIDE (pré-texte)
    { "type": "thinking", "thinking": "Let me analyze..." },  // raisonnement
    { "type": "text", "text": "```json\n{...}\n```" }         // JSON réel ici
  ]
}
```

**Solution** : ne PAS prendre le premier bloc `text`. Prendre le bloc `text` **le plus long** :

```typescript
const textBlocks = data.content.filter((b: any) => b.type === 'text')
const textBlock = textBlocks.length > 1
  ? textBlocks.reduce((best: any, b: any) =>
      (b.text?.length ?? 0) > (best.text?.length ?? 0) ? b : best)
  : textBlocks[0]
```

### 2.3 Structured output vs Adaptive thinking — INCOMPATIBILITÉ

Les structured outputs Anthropic (`output_config.format` avec JSON schema) sont **incompatibles** avec l'adaptive thinking d'Opus 4.6 :

- Si on active `output_config.format` + `thinking.type: 'adaptive'` → la réponse est souvent vide ou tronquée.
- **Règle** : pour Opus 4.6, NE PAS utiliser de structured output. Utiliser uniquement le prompt pour demander du JSON, et parser la réponse.
- Pour les autres modèles Anthropic (Haiku, Sonnet), les structured outputs fonctionnent normalement.

### 2.4 Paramètres spécifiques Opus 4.6

```typescript
const body = {
  model: 'claude-opus-4-6',
  max_tokens: 64000,          // 64k obligatoire (sinon troncature silencieuse)
  thinking: { type: 'adaptive' },
  // PAS de temperature (ignoré avec adaptive thinking)
  // PAS de output_config.format (incompatible)
  messages: [...]
}
```

### 2.5 Extraction JSON depuis le bloc thinking (fallback)

Si le bloc `text` est vide/court, le JSON peut se trouver dans le bloc `thinking`. Regex élargie aux clés françaises :

```typescript
const jsonMatch = thinking.match(
  /\{[\s\S]*?("questions"|"sections"|"exercices"|"items"|"bareme"|"barème"|
  "note_globale"|"total"|"total_points"|"total_général"|"criteres"|"critères"|
  "resultats"|"résultats"|"corrections")[\s\S]*\}/
)
```

Fallback structural (accolades équilibrées) si la regex échoue :

```typescript
function extractValidJson(text: string): string | null {
  const starts: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') starts.push(i)
  }
  for (const start of starts) {
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          if (candidate.length > 50) {
            try { JSON.parse(candidate); return candidate } catch {}
          }
          break
        }
      }
    }
  }
  return null
}
```

### 2.6 Prompt caching Anthropic

Le cache est **explicite** chez Anthropic — il faut ajouter `cache_control` sur les blocs à cacher :

```typescript
content: [
  {
    type: 'text',
    text: baremeEtEnonce,
    cache_control: { type: 'ephemeral' }  // cache 5 min
  },
  { type: 'text', text: copieDeLEleve }
]
```

Vérifier le cache dans l'usage de la réponse : `usage.cache_read_input_tokens > 0`.

### 2.7 Images Anthropic

```typescript
{
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: '<base64>' }
}
```

---

## 3. OpenAI (GPT)

### 3.1 Deux endpoints distincts

| Modèle | Endpoint | Raison |
|--------|----------|--------|
| gpt-4o-mini, gpt-5.2 | `/v1/chat/completions` | Chat standard |
| gpt-5.2-pro | `/v1/responses` | API "responses" pour modèles reasoning |

**Erreur typique** : envoyer gpt-5.2-pro sur `/v1/chat/completions` → `404 "This is not a chat model"`.

### 3.2 JSON mode OpenAI

```typescript
response_format: { type: 'json_object' }
```

Fonctionne sur tous les modèles OpenAI. Le JSON est garanti valide.

### 3.3 Prompt caching OpenAI

Le cache est **automatique** (prefix caching). Pas de configuration nécessaire. Les longs préfixes identiques entre appels successifs sont cachés côté serveur.

### 3.4 Format de critères atypique (GPT-4o Mini)

GPT-4o Mini peut retourner les critères comme un objet à clés numériques avec des valeurs string :

```json
{
  "critères": {
    "0": "Réponse correcte : 2 pts",
    "1": "Argumentation claire : 3 pts"
  }
}
```

**Solution** : extraire les points depuis le texte avec une regex :

```typescript
const ptsMatch = String(desc).match(/(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)/i)
const pts = ptsMatch ? Number(ptsMatch[1].replace(',', '.')) : 0
```

### 3.5 Images OpenAI

```typescript
{
  type: 'image_url',
  image_url: { url: `data:image/jpeg;base64,${base64}` }
}
```

### 3.6 Reproductibilité

```typescript
temperature: 0,
seed: 42
```

Le seed améliore la reproductibilité mais ne la garantit pas à 100%.

---

## 4. Google Gemini

### 4.1 Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
```

Pas de header d'auth — la clé est dans l'URL.

### 4.2 JSON mode Gemini

```typescript
generationConfig: {
  temperature: 0,
  responseMimeType: 'application/json'
}
```

### 4.3 Safety settings obligatoires

Sans ces settings, les contenus éducatifs (textes littéraires, sujets d'examen) sont souvent bloqués :

```typescript
safetySettings: [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
]
```

### 4.4 Erreur RECITATION

Gemini peut refuser de transcrire du contenu qu'il reconnaît comme protégé par le droit d'auteur :

```json
{ "finishReason": "RECITATION" }
```

**Solution** : fallback automatique vers un autre modèle (ex: Gemini Flash → Gemini Pro → Mistral OCR).

### 4.5 Format de sortie atypique (Gemini Flash)

Gemini Flash peut retourner un tableau contenant un seul objet dont les clés sont les titres des questions :

```json
[
  {
    "1)a) Identifier le COD": { "Points": 1, "Critères": [...] },
    "1)b) Réécrire avec pronom": { "Points": 1, "Critères": [...] }
  }
]
```

**Solution** : détecter ce pattern et le déplier :

```typescript
if (parsed.length === 1 && typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
  const keys = Object.keys(parsed[0])
  if (keys.length > 1 && typeof parsed[0][keys[0]] === 'object') {
    sections = keys.map((titre) => ({ titre, ...parsed[0][titre] }))
  }
}
```

### 4.6 Clés capitalisées

Gemini utilise souvent des clés avec majuscule : `Points`, `Critères`, `Criteres`. Toujours prévoir les deux variantes dans le code de normalisation.

### 4.7 Images Gemini

```typescript
{
  inline_data: { mime_type: 'image/jpeg', data: '<base64>' }
}
```

### 4.8 Prompt caching Gemini

Cache automatique (comme OpenAI). Pas de configuration nécessaire.

---

## 5. DeepSeek

### 5.1 Endpoint

```
POST https://api.deepseek.com/chat/completions
Headers: Authorization: Bearer <DEEPSEEK_API_KEY>
```

### 5.2 Limitations

- **Pas de multimodalité** : text-only. Toujours envoyer du texte transcrit, jamais d'images.
- Modèle API : `deepseek-chat` (correspond à DeepSeek V3.2).

### 5.3 JSON mode

```typescript
response_format: { type: 'json_object' }
```

### 5.4 Format de critères atypique

DeepSeek peut retourner les critères comme un **string unique** au lieu d'un tableau :

```json
{
  "critères": "Identifier le COD complet. Réponse exacte : 1 point. Réponse partielle : 0 point."
}
```

**Solution** : quand `critères` est un string, créer un critère unique en récupérant les points depuis le champ `points` de la section parente.

### 5.5 Clé `barème` accentuée

DeepSeek utilise souvent `"barème"` (avec accent) comme clé racine au lieu de `"bareme"`. Toujours chercher les deux variantes :

```typescript
parsed.bareme || parsed['barème']
```

### 5.6 Reproductibilité

```typescript
temperature: 0,
seed: 42
```

---

## 6. Mistral

### 6.1 Endpoint

```
POST https://api.mistral.ai/v1/chat/completions
Headers: Authorization: Bearer <MISTRAL_API_KEY>
```

### 6.2 Multimodalité

Mistral Large (mistral-large-2512) **est multimodal**. Les images s'envoient au format OpenAI :

```typescript
{
  type: 'image_url',
  image_url: { url: `data:image/jpeg;base64,${base64}` }
}
```

### 6.3 JSON mode garanti

```typescript
response_format: { type: 'json_object' }
```

Le JSON est garanti valide en sortie. Disponible sur tous les modèles sauf codestral-mamba.

### 6.4 Format de critères atypique

Mistral peut retourner les critères comme un objet `{ "description": points_number }` :

```json
{
  "critères": {
    "Identification correcte du COD": 1,
    "Recopie intégrale": 0.5
  }
}
```

**Solution** :

```typescript
if (typeof value === 'number' && value > 0) {
  // Format Mistral : { "description": points }
  return entries.map(([desc, pts]) => ({
    question: '', description: desc, points: Number(pts)
  }))
}
```

### 6.5 Format barème en objet (pas en tableau)

Mistral peut retourner le barème comme un objet dont les clés sont les titres :

```json
{
  "barème": {
    "1a) Identifier le COD": { "critères": {...}, "points": 1 },
    "1b) Réécrire": { "critères": {...}, "points": 1 }
  }
}
```

**Solution** : convertir en tableau :

```typescript
if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
  sections = Object.entries(candidate).map(([titre, value]) => ({
    titre, ...(typeof value === 'object' ? value : {})
  }))
}
```

### 6.6 Rate limiting

Mistral a des rate limits plus agressifs que les autres providers. Prévoir un retry avec backoff ou un fallback.

### 6.7 Mistral OCR

Mistral propose un endpoint OCR dédié (`https://api.mistral.ai/v1/ocr`) qui est excellent pour la transcription d'images en texte structuré (Markdown). C'est un bon fallback de transcription derrière Gemini.

---

## 7. Parsing JSON robuste — Stratégie universelle

Les LLMs ne retournent pas toujours du JSON valide, même avec le JSON mode activé. Voici la stratégie de parsing en cascade :

```
1. JSON.parse(raw)                          → succès direct
2. Extraire /\{[\s\S]*\}/ puis parse        → JSON enveloppé dans du texte
3. repairJson() puis parse                  → réparation des erreurs courantes
4. Extraire depuis ```json ... ``` puis parse → bloc markdown
5. repairJson() sur le bloc markdown         → dernier recours
6. return null                               → échec total
```

### Réparations automatiques

```typescript
function repairJson(raw: string): string {
  let s = raw
  s = s.replace(/\/\/[^\n]*/g, '')         // Retirer commentaires //
  s = s.replace(/,\s*([}\]])/g, '$1')      // Virgules traînantes
  s = s.replace(/'/g, '"')                 // Single → double quotes

  // Accolades/crochets manquants
  const opens = (s.match(/\{/g) || []).length
  const closes = (s.match(/\}/g) || []).length
  if (opens > closes) s += '}'.repeat(opens - closes)

  const openB = (s.match(/\[/g) || []).length
  const closeB = (s.match(/\]/g) || []).length
  if (openB > closeB) s += ']'.repeat(openB - closeB)

  return s
}
```

---

## 8. Normalisation des structures JSON

Chaque LLM retourne une structure légèrement différente. La normalisation doit gérer toutes ces variantes.

### 8.1 Clés racine

Le même concept peut apparaître sous différentes clés selon le LLM :

| Concept | Variantes rencontrées |
|---------|-----------------------|
| Liste de sections | `questions`, `sections`, `exercices`, `items`, `bareme`, `barème` |
| Total des points | `total`, `total_points`, `totalPoints`, `note_totale`, `total_général` |
| Titre d'une section | `titre`, `title`, `section`, `nom`, `name`, `intitule` |
| Critères | `criteres`, `critères`, `criteria`, `details`, `Criteres`, `Critères`, `Criteria` |
| Points | `points`, `Points`, `total`, `note_max`, `max`, `pts` |

### 8.2 Formats de critères rencontrés

| Format | Provider typique | Exemple |
|--------|-----------------|---------|
| Tableau d'objets | Opus, Haiku, Gemini Pro | `[{ "description": "...", "points": 2 }]` |
| Tableau de strings | GPT-5.2 | `["Critère 1 (2 pts)", "Critère 2 (3 pts)"]` |
| Objet `{ desc: points }` | Mistral | `{ "Bonne réponse": 2 }` |
| Objet `{ index: string }` | GPT-4o Mini | `{ "0": "Réponse correcte : 2 pts" }` |
| String unique | DeepSeek | `"Identifier le COD. 1 point si correct."` |
| Clés capitalisées | Gemini Flash | `{ "Critères": [...], "Points": 4 }` |
| Absent | Tous | → créer un critère unique depuis la section |

### 8.3 Formats de barème racine

| Format | Provider typique | Structure |
|--------|-----------------|-----------|
| Objet avec tableau | Standard | `{ "questions": [...], "total": 50 }` |
| Tableau brut | Gemini Pro | `[{ "titre": "...", "points": 2 }]` |
| Tableau à 1 objet multi-clés | Gemini Flash | `[{ "Q1": {...}, "Q2": {...} }]` |
| Objet dont les clés = titres | Mistral | `{ "barème": { "Q1 titre": {...} } }` |
| Clé accentuée | DeepSeek | `{ "barème": [...] }` |

### 8.4 Règle d'or de la normalisation

Toujours calculer les points d'une section en cascade :
1. Somme des critères (si > 0)
2. Sinon : champ `points` de la section
3. Sinon : champ `Points` (majuscule)
4. Sinon : champ `total`, `note_max`, `max`
5. Sinon : 0

```typescript
const criteresSum = criteres.reduce((sum, c) => sum + (c.points || 0), 0)
const points = criteresSum > 0
  ? criteresSum
  : Number(q.points || q.Points || q.total || q.note_max || q.max || 0)
```

---

## 9. Prompt caching

| Provider | Type de cache | Configuration |
|----------|---------------|---------------|
| Anthropic | Explicite | `cache_control: { type: 'ephemeral' }` sur chaque bloc (durée 5 min) |
| OpenAI | Automatique | Prefix caching transparent côté serveur |
| Google Gemini | Automatique | Prefix caching transparent côté serveur |
| DeepSeek | Automatique | Prefix caching transparent côté serveur |
| Mistral | Non documenté | Supposé automatique |

**Stratégie pour la correction de copies** : placer l'énoncé + le corrigé + le barème en premier dans le prompt (parties fixes = cachées), puis la copie de l'élève en dernier (partie variable).

---

## 10. Multimodalité (images)

### 10.1 Formats par provider

| Provider | Format image | Dans le message |
|----------|-------------|-----------------|
| Anthropic | `{ type: 'image', source: { type: 'base64', media_type, data } }` | `content[]` |
| OpenAI | `{ type: 'image_url', image_url: { url: 'data:mime;base64,...' } }` | `content[]` |
| Gemini | `{ inline_data: { mime_type, data } }` | `parts[]` |
| Mistral | Format OpenAI (identique) | `content[]` |
| DeepSeek | Non supporté | N/A |

### 10.2 Safari / iOS — piège base64

Sur Safari, `fetch` peut rejeter les payloads base64 très longs avec l'erreur :
> `"the string did not match the expected pattern"`

**Solution** : conditionner l'envoi. Si on a le texte transcrit, envoyer le texte plutôt que les images. Sinon, compresser les images côté client avant envoi.

### 10.3 Taille des payloads

7 images JPEG (4 énoncé + 3 corrigé) = ~25 MB en base64. C'est la limite pratique. Au-delà :
- Compresser côté client (redimensionner, réduire la qualité JPEG)
- Envoyer le texte transcrit plutôt que les images quand possible

---

## 11. Déploiement Vercel

### 11.1 Timeout des fonctions serverless

Par défaut : 10s (Hobby) / 60s (Pro). Pour les appels LLM longs (Opus : ~100s) :

```typescript
export const maxDuration = 300 // 5 minutes — nécessite plan Pro
```

### 11.2 Filesystem en lecture seule

Vercel n'a pas de filesystem persistant. Pour le logging :

```typescript
const isVercel = process.env.VERCEL === '1'
if (isVercel) {
  console.log(JSON.stringify(logData)) // → Vercel Logs
} else {
  writeFileSync(path, JSON.stringify(logData, null, 2)) // → fichier local
}
```

### 11.3 Payload size

Limite de body : 4.5 MB sur le plan Hobby. Avec des images base64, on dépasse vite. Envoyer du texte transcrit quand possible.

---

## 12. Checklist d'intégration d'un nouveau LLM

Quand tu ajoutes un nouveau provider/modèle LLM qui doit retourner du JSON :

- [ ] **Endpoint et auth** : documenter URL, headers, format de clé API
- [ ] **Multimodalité** : vérifier si le modèle accepte les images, et dans quel format
- [ ] **JSON mode** : activer le mode JSON natif si disponible (réduit les erreurs de parsing)
- [ ] **Tester la structure JSON retournée** : sauvegarder la réponse brute dans un log
- [ ] **Variantes de clés** : vérifier les noms de clés (accents, majuscules, synonymes)
- [ ] **Format des critères/sous-items** : tableau, objet, string ? Adapter `normalizeCriteres`
- [ ] **Format racine** : objet avec tableau, tableau brut, objet-clés ? Adapter `normalizeBareme`
- [ ] **Adaptive/reasoning** : le modèle a-t-il un mode "thinking" ? Si oui, extraire le JSON du bon bloc
- [ ] **Structured outputs** : compatible avec le mode reasoning du modèle ?
- [ ] **max_tokens** : certains modèles nécessitent une valeur haute (Opus : 64k)
- [ ] **temperature** : certains modèles reasoning ignorent la temperature
- [ ] **Rate limits** : documenter les limites, prévoir fallback/retry
- [ ] **Prompt caching** : explicite ou automatique ? Configurer si nécessaire
- [ ] **Fallback chain** : définir quel modèle prend le relais en cas d'échec

---

## Annexe — Chaînes de fallback recommandées

### Transcription d'images → texte
```
gemini-3-flash → gemini-3-pro → mistral-ocr
```

### Génération de barème (images)
```
claude-opus-4-6 → gemini-3-pro
```

### Correction de copies (texte)
```
deepseek-v3.2 → mistral-large → gemini-3-pro
```

---

*Dernière mise à jour : 10 février 2026*
*Basé sur les tests réels de 8 modèles avec des images de sujets d'examen (DNB Français 2019)*
