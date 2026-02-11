export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { callLLM, callMistralOCR, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { logLLMCall } from '@/lib/llm-logger'
import { RECITATION_WORKAROUND_SUFFIX, cleanLineNumbers } from '@/lib/prompts'

const TRANSCRIPTION_DOC_PROMPT = `Tu es un assistant pédagogique qui aide un enseignant à numériser ses documents de cours.
L'enseignant te fournit des photos d'un document scolaire (contrôle, exercice, ou corrigé) qu'il a lui-même rédigé.
Ton rôle est de produire une transcription **richement formatée en Markdown**, lisible et fidèle au document original.

RÈGLES DE FORMATAGE MARKDOWN (obligatoires) :
- # pour le titre principal du document (nom de l'examen, matière)
- ## pour les grandes sections (A. Texte littéraire, B. Image, Grammaire, Compréhension…)
- ### pour les sous-sections ou groupes de questions
- **gras** pour les éléments importants : série, durée, barème/points, mots-clés de consignes
- *italiques* pour les textes introductifs, chapeaux, contextualisations
- > citation pour les consignes générales (instructions de début de sujet)
- --- entre chaque page du document (séparateur de page)
- Numérotation fidèle des questions (**1.**, **a.**, **b.**, etc.) en conservant la hiérarchie originale
- AÉRATION : insère une ligne vide entre chaque élément (titre, paragraphe, question, consigne, note) pour reproduire visuellement l'espacement du document original. Chaque question, chaque sous-question, chaque bloc de texte doit être séparé par une ligne vide. Le rendu doit être aussi aéré que le document papier.

RÈGLES DE CONTENU :
- Restitue le contenu COMPLET du document, sans rien omettre ni résumer.
- Conserve la structure originale (titres, numérotation, sous-parties, consignes).
- Sois fidèle au contenu : n'invente rien.
- Si un passage est difficile à lire, signale avec [illisible].
- Pour les pieds de page (références, numéros de page), place-les en italique en fin de section.

ÉLÉMENTS SPÉCIAUX :
- Visuels (graphiques, schémas, figures) : décris-les en détail entre balises [FIGURE: description détaillée incluant type, axes, légendes, valeurs, formes, couleurs]
- Tableaux : syntaxe Markdown de tableau
- Formules mathématiques : notation LaTeX entre $ ou $$
- Notes de bas de page : utilise le format "1 - mot : définition" en fin de section

EXEMPLE DE RENDU ATTENDU :
\`\`\`
# DIPLÔME NATIONAL DU BREVET — SESSION 2024

## MATHÉMATIQUES — Série générale

**Durée : 2 h 00 | 100 points**

> L'utilisation de la calculatrice est autorisée.
> Ce sujet comporte 6 pages.

---

## Exercice 1 — Géométrie **(25 points)**

**1.** Calculer la longueur $AB$ dans le triangle ci-dessous.

**2.** En déduire l'aire du triangle $ABC$.
\`\`\``

// Pipeline de transcription pour documents officiels (énoncé/corrigé).
// Les documents officiels déclenchent quasi systématiquement RECITATION,
// donc on commence directement par le prompt numéroté [Lx] pour éviter
// de perdre ~13s sur un premier essai voué à l'échec.
// 1. Gemini Flash [Lx] (prompt numéroté — contournement RECITATION)
// 2. Gemini Pro [Lx]
// 3. Gemini Flash (prompt normal — au cas où [Lx] échoue pour autre raison)
// 4. Mistral OCR (fallback final)
interface TranscriptionStep {
  model: string
  label: string
  numbered: boolean
}

const PIPELINE: TranscriptionStep[] = [
  { model: 'gemini-3-flash', label: 'Gemini Flash [Lx]', numbered: true },
  { model: 'gemini-3-pro', label: 'Gemini Pro [Lx]', numbered: true },
  { model: 'gemini-3-flash', label: 'Gemini Flash', numbered: false },
  { model: 'mistral-ocr', label: 'Mistral OCR', numbered: false },
]

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[TRANSCRIBE-DOC] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { images } = body

    if (!images?.length) {
      return NextResponse.json({ error: 'Images manquantes' }, { status: 400 })
    }

    log(`Début — ${images.length} images`)

    const env = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    }

    // Parser les images
    const parsed: ImageContent[] = []
    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        parsed.push({ mimeType: match[1], base64: match[2] })
      }
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Aucune image valide' }, { status: 400 })
    }

    const totalKb = Math.round(parsed.reduce((s, i) => s + i.base64.length, 0) / 1024)
    log(`${parsed.length} images (${totalKb} KB)`)

    // Pipeline de transcription avec contournement RECITATION
    let lastError: Error | null = null
    const failedSteps: string[] = []
    const skipLabels = new Set<string>()

    for (const step of PIPELINE) {
      if (skipLabels.has(step.label)) continue

      try {
        log(`Tentative ${step.label}...`)

        let result: string
        let promptSent: string

        if (step.model === 'mistral-ocr') {
          // Mistral OCR : API dédiée, traite une image à la fois → concaténer
          const mistralKey = env.MISTRAL_API_KEY
          if (!mistralKey) throw new Error('MISTRAL_API_KEY manquante')

          const pages = await Promise.all(
            parsed.map((img) => callMistralOCR(img.base64, img.mimeType, mistralKey))
          )
          result = pages.join('\n\n---\n\n')
          promptSent = `[Mistral OCR — ${parsed.length} images envoyées individuellement, pas de prompt textuel]`
        } else {
          // Gemini : multimodal, toutes les images en une seule requête
          const prompt = step.numbered
            ? TRANSCRIPTION_DOC_PROMPT + RECITATION_WORKAROUND_SUFFIX
            : TRANSCRIPTION_DOC_PROMPT
          const messages = buildMessagesWithImages(prompt, parsed, step.model)
          result = await callLLM(step.model, messages, env, {
            thinkingLevel: 'low',
          })
          promptSent = prompt

          // Nettoyer les [Lx] si le prompt numéroté a été utilisé
          if (step.numbered && result) {
            result = cleanLineNumbers(result)
          }
        }

        if (!result || result.trim().length < 20) {
          throw new Error(`Réponse trop courte (${result?.length ?? 0} chars)`)
        }

        const elapsedMs = performance.now() - t0
        log(`✅ ${step.label} — Terminé (${result.length} chars)`)

        logLLMCall({
          type: 'transcription-doc',
          model: step.model,
          provider: step.model === 'mistral-ocr' ? 'mistral' : 'google',
          prompt: { full: promptSent },
          messages: [{ role: 'user', content: `${promptSent}\n\n[${parsed.length} images jointes — non incluses dans le log]` }],
          options: {},
          response_raw: result,
          response_parsed: null,
          meta: {
            elapsed_ms: Math.round(elapsedMs),
            timestamp: new Date().toISOString(),
            images_count: parsed.length,
            images_size_kb: Math.round(totalKb),
            failed_steps: failedSteps.length > 0 ? failedSteps : undefined,
            numbered_workaround: step.numbered,
          },
        })

        return NextResponse.json({ text: result })
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const isRecitation = lastError.message.includes('RECITATION')
        log(`⚠️ ${step.label} échoué${isRecitation ? ' (RECITATION)' : ''} : ${lastError.message}`)
        failedSteps.push(`${step.label}: ${lastError.message}`)

        // Si l'erreur n'est PAS RECITATION → inutile de retenter le même modèle avec [Lx]
        if (!isRecitation && !step.numbered && step.model !== 'mistral-ocr') {
          const numberedLabel = PIPELINE.find(
            (s) => s.model === step.model && s.numbered
          )?.label
          if (numberedLabel) {
            log(`⏭️ Skip ${numberedLabel} (erreur non-RECITATION)`)
            failedSteps.push(`${numberedLabel}: skipped (non-RECITATION error)`)
            skipLabels.add(numberedLabel)
          }
        }
      }
    }

    // Tous les modèles ont échoué
    throw lastError ?? new Error('Tous les modèles de transcription ont échoué')
  } catch (err: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[TRANSCRIBE-DOC] ❌ ${elapsed}s — Erreur:`, err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
