import { NextRequest, NextResponse } from 'next/server'
import {
  callLLM,
  callMistralOCR,
  buildMessagesWithImages,
  type ImageContent,
} from '@/lib/api-clients'
import { getTranscriptionPrompt } from '@/lib/prompts'

// Pipeline fixe : Gemini 3 Flash → Gemini 3 Pro → Mistral OCR
const PIPELINE = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
  { id: 'mistral-ocr', label: 'Mistral OCR' },
]

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { images, enonceImages } = body

    if (!images?.length || !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants : images et enonceImages requis' },
        { status: 400 }
      )
    }

    const env = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    }

    const prompt = getTranscriptionPrompt('[Voir images de l\'énoncé ci-jointes]')

    // Préparer les images (énoncé + copie)
    const allImages: ImageContent[] = []

    for (const img of enonceImages) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        allImages.push({ mimeType: match[1], base64: match[2] })
      }
    }

    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        allImages.push({ mimeType: match[1], base64: match[2] })
      }
    }

    const errors: string[] = []

    // --- Tentative 1 & 2 : Gemini Flash puis Gemini Pro ---
    for (const model of PIPELINE.filter((m) => m.id !== 'mistral-ocr')) {
      try {
        console.log(`Transcription : tentative avec ${model.label}...`)
        const messages = buildMessagesWithImages(prompt, allImages, model.id)
        const result = await callLLM(model.id, messages, env)
        console.log(`Transcription réussie avec ${model.label}`)
        return NextResponse.json({ transcription: result, model: model.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        console.warn(`Échec ${model.label}: ${msg}`)
        errors.push(`${model.label}: ${msg}`)
      }
    }

    // --- Fallback final : Mistral OCR ---
    try {
      console.log('Transcription : fallback Mistral OCR...')

      if (!env.MISTRAL_API_KEY) {
        throw new Error('Clé API Mistral non configurée')
      }

      let rawText = ''
      // Pour Mistral OCR, on n'envoie que les images de la copie (pas l'énoncé)
      for (const img of images) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) continue
        rawText += await callMistralOCR(match[2], match[1], env.MISTRAL_API_KEY)
        rawText += '\n\n'
      }

      console.log('Transcription réussie avec Mistral OCR')
      return NextResponse.json({ transcription: rawText.trim(), model: 'mistral-ocr' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      errors.push(`Mistral OCR: ${msg}`)
    }

    // Tous les modèles ont échoué
    return NextResponse.json(
      { error: `Tous les modèles ont échoué :\n${errors.join('\n')}` },
      { status: 500 }
    )
  } catch (err: unknown) {
    console.error('Erreur transcription:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
