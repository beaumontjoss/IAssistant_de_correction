import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { getTranscriptionPrompt } from '@/lib/prompts'

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { modelId, images, enonceImages } = body

    if (!modelId || !images?.length || !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Parametres manquants' },
        { status: 400 }
      )
    }

    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
    }

    // Get enonce text representation
    const prompt = getTranscriptionPrompt('[Voir images de l\'enonce ci-jointes]')

    // Build image contents: enonce images first, then copy images
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

    const messages = buildMessagesWithImages(prompt, allImages, modelId)
    const result = await callLLM(modelId, messages, env)

    return NextResponse.json({ transcription: result })
  } catch (err: unknown) {
    console.error('Erreur transcription:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
