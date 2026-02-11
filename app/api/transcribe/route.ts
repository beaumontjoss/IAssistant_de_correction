export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  callLLM,
  callMistralOCR,
  buildMessagesWithImages,
  type ImageContent,
} from '@/lib/api-clients'
import { getTranscriptionPrompt, RECITATION_WORKAROUND_SUFFIX, cleanLineNumbers } from '@/lib/prompts'
import { logLLMCall } from '@/lib/llm-logger'

// Pipeline avec contournement RECITATION :
// 1. Gemini Flash (prompt normal)
// 2. Gemini Flash (prompt numéroté [Lx])
// 3. Gemini Pro (prompt normal)
// 4. Gemini Pro (prompt numéroté [Lx])
// 5. Mistral OCR (fallback final)
interface TranscriptionStep {
  id: string
  label: string
  numbered: boolean
}

const PIPELINE: TranscriptionStep[] = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', numbered: false },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash [Lx]', numbered: true },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', numbered: false },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro [Lx]', numbered: true },
  { id: 'mistral-ocr', label: 'Mistral OCR', numbered: false },
]

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[TRANSCRIPTION] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { images, enonceImages, enonceText } = body

    if (!images?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants : images requis' },
        { status: 400 }
      )
    }

    if (!enonceText && !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants : enonceText ou enonceImages requis' },
        { status: 400 }
      )
    }

    // Mode texte : on injecte la transcription de l'énoncé directement dans le prompt
    const useTextMode = !!enonceText
    log(`Début — ${images.length} img copie, ${useTextMode ? 'mode texte (énoncé transcrit)' : `${enonceImages.length} img énoncé`}`)

    const env = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    }

    const prompt = useTextMode
      ? getTranscriptionPrompt(enonceText)
      : getTranscriptionPrompt('[Voir images de l\'énoncé ci-jointes]')

    // Préparer les images (énoncé si pas de texte + copie)
    const allImages: ImageContent[] = []

    if (!useTextMode) {
      for (const img of enonceImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          allImages.push({ mimeType: match[1], base64: match[2] })
        }
      }
    }

    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        allImages.push({ mimeType: match[1], base64: match[2] })
      }
    }

    const totalImgSize = allImages.reduce((sum, img) => sum + img.base64.length, 0)
    log(`${allImages.length} images préparées (${(totalImgSize / 1024).toFixed(0)} KB base64)`)

    const errors: string[] = []
    const skipLabels = new Set<string>()

    for (const step of PIPELINE) {
      if (skipLabels.has(step.label)) continue

      try {
        log(`Tentative ${step.label}...`)

        let result: string
        let promptSent: string

        if (step.id === 'mistral-ocr') {
          // Mistral OCR : API dédiée, image par image (copie uniquement)
          if (!env.MISTRAL_API_KEY) throw new Error('Clé API Mistral non configurée')

          let rawText = ''
          for (let i = 0; i < images.length; i++) {
            const match = images[i].match(/^data:([^;]+);base64,(.+)$/)
            if (!match) continue
            log(`Mistral OCR — page ${i + 1}/${images.length}`)
            rawText += await callMistralOCR(match[2], match[1], env.MISTRAL_API_KEY)
            rawText += '\n\n'
          }
          result = rawText.trim()
          promptSent = `[Mistral OCR — ${images.length} pages de copie]`
        } else {
          // Gemini : multimodal, toutes les images en une seule requête
          const effectivePrompt = step.numbered
            ? prompt + RECITATION_WORKAROUND_SUFFIX
            : prompt
          const messages = buildMessagesWithImages(effectivePrompt, allImages, step.id)
          result = await callLLM(step.id, messages, env, {
            thinkingLevel: 'low',
          })
          promptSent = effectivePrompt

          // Nettoyer les [Lx] si le prompt numéroté a été utilisé
          if (step.numbered && result) {
            result = cleanLineNumbers(result)
          }
        }

        if (!result || result.trim().length < 20) {
          throw new Error(`Réponse trop courte (${result?.length ?? 0} chars)`)
        }

        log(`✅ ${step.label} (${result.length} chars)`)
        const { transcription, nom_eleve } = extractStudentName(result)
        if (nom_eleve) log(`📛 Nom extrait : ${nom_eleve}`)

        logLLMCall({
          type: 'transcription-copie',
          model: step.id,
          provider: step.id === 'mistral-ocr' ? 'mistral' : 'google',
          prompt: { full: promptSent },
          messages: [{ role: 'user', content: `${promptSent}\n\n[${allImages.length} images jointes — non incluses dans le log]` }],
          options: {},
          response_raw: result,
          response_parsed: { transcription, nom_eleve },
          meta: {
            elapsed_ms: Math.round(performance.now() - t0),
            timestamp: new Date().toISOString(),
            images_count: allImages.length,
            images_size_kb: Math.round(totalImgSize / 1024),
            failed_steps: errors.length > 0 ? errors : undefined,
            numbered_workaround: step.numbered,
          },
        })

        return NextResponse.json({ transcription, nom_eleve, model: step.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        const isRecitation = msg.includes('RECITATION')
        log(`⚠️ ${step.label} échoué${isRecitation ? ' (RECITATION)' : ''}: ${msg}`)
        errors.push(`${step.label}: ${msg}`)

        // Si l'erreur n'est PAS RECITATION → inutile de retenter le même modèle avec [Lx]
        if (!isRecitation && !step.numbered && step.id !== 'mistral-ocr') {
          const numberedLabel = PIPELINE.find(
            (s) => s.id === step.id && s.numbered
          )?.label
          if (numberedLabel) {
            log(`⏭️ Skip ${numberedLabel} (erreur non-RECITATION)`)
            errors.push(`${numberedLabel}: skipped (non-RECITATION error)`)
            skipLabels.add(numberedLabel)
          }
        }
      }
    }

    // Tous les modèles ont échoué
    log('❌ Tous les modèles ont échoué')
    return NextResponse.json(
      { error: `Tous les modèles ont échoué :\n${errors.join('\n')}` },
      { status: 500 }
    )
  } catch (err: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[TRANSCRIPTION] ❌ ${elapsed}s — Erreur:`, err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Extrait le nom de l'élève depuis la première ligne de la transcription
 * si elle commence par "NOM:" ou "NOM :" (case-insensitive).
 * Retourne la transcription nettoyée et le nom extrait (ou null).
 */
function extractStudentName (raw: string): { transcription: string; nom_eleve: string | null } {
  const lines = raw.split('\n')
  const firstLine = lines[0]?.trim() ?? ''

  const match = firstLine.match(/^NOM\s*:\s*(.+)$/i)
  if (match) {
    const nom = match[1].trim()
    // Retirer la ligne NOM: et les lignes vides qui suivent
    let startIndex = 1
    while (startIndex < lines.length && lines[startIndex].trim() === '') {
      startIndex++
    }
    return {
      transcription: lines.slice(startIndex).join('\n'),
      nom_eleve: nom || null,
    }
  }

  return { transcription: raw, nom_eleve: null }
}
