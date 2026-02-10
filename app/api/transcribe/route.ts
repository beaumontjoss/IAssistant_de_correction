export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  callLLM,
  callMistralOCR,
  buildMessagesWithImages,
  type ImageContent,
} from '@/lib/api-clients'
import { getTranscriptionPrompt } from '@/lib/prompts'
import { logLLMCall } from '@/lib/llm-logger'

// Pipeline fixe : Gemini 3 Flash → Gemini 3 Pro → Mistral OCR
const PIPELINE = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
  { id: 'mistral-ocr', label: 'Mistral OCR' },
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

    // --- Tentative 1 & 2 : Gemini Flash puis Gemini Pro ---
    for (const model of PIPELINE.filter((m) => m.id !== 'mistral-ocr')) {
      try {
        log(`Tentative ${model.label}...`)
        const messages = buildMessagesWithImages(prompt, allImages, model.id)
        const result = await callLLM(model.id, messages, env)
        log(`✅ Réussi avec ${model.label} (${result.length} chars)`)
        const { transcription, nom_eleve } = extractStudentName(result)
        if (nom_eleve) log(`📛 Nom extrait : ${nom_eleve}`)

        logLLMCall({
          type: 'transcription-copie',
          model: model.id,
          provider: 'google',
          prompt: { full: prompt },
          messages: [{ role: 'user', content: `${prompt}\n\n[${allImages.length} images jointes — non incluses dans le log]` }],
          options: {},
          response_raw: result,
          response_parsed: { transcription, nom_eleve },
          meta: {
            elapsed_ms: Math.round(performance.now() - t0),
            timestamp: new Date().toISOString(),
            images_count: allImages.length,
            images_size_kb: Math.round(totalImgSize / 1024),
            failed_models: errors.length > 0 ? errors : undefined,
          },
        })

        return NextResponse.json({ transcription, nom_eleve, model: model.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        log(`⚠️ Échec ${model.label}: ${msg}`)
        errors.push(`${model.label}: ${msg}`)
      }
    }

    // --- Fallback final : Mistral OCR ---
    try {
      log('Fallback Mistral OCR...')

      if (!env.MISTRAL_API_KEY) {
        throw new Error('Clé API Mistral non configurée')
      }

      let rawText = ''
      // Pour Mistral OCR, on n'envoie que les images de la copie (pas l'énoncé)
      for (let i = 0; i < images.length; i++) {
        const match = images[i].match(/^data:([^;]+);base64,(.+)$/)
        if (!match) continue
        log(`Mistral OCR — page ${i + 1}/${images.length}`)
        rawText += await callMistralOCR(match[2], match[1], env.MISTRAL_API_KEY)
        rawText += '\n\n'
      }

      log(`✅ Réussi avec Mistral OCR (${rawText.length} chars)`)
      const { transcription, nom_eleve } = extractStudentName(rawText.trim())
      if (nom_eleve) log(`📛 Nom extrait : ${nom_eleve}`)

      logLLMCall({
        type: 'transcription-copie',
        model: 'mistral-ocr',
        provider: 'mistral',
        prompt: { full: '[Mistral OCR — images envoyées individuellement, pas de prompt textuel]' },
        messages: [{ role: 'user', content: `[Mistral OCR — ${images.length} pages de copie]` }],
        options: {},
        response_raw: rawText.trim(),
        response_parsed: { transcription, nom_eleve },
        meta: {
          elapsed_ms: Math.round(performance.now() - t0),
          timestamp: new Date().toISOString(),
          images_count: images.length,
          failed_models: errors,
        },
      })

      return NextResponse.json({ transcription, nom_eleve, model: 'mistral-ocr' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      log(`❌ Échec Mistral OCR: ${msg}`)
      errors.push(`Mistral OCR: ${msg}`)
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
