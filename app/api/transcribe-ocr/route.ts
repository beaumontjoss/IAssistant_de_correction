import { NextRequest, NextResponse } from 'next/server'
import {
  callMistralOCR,
  callGoogleVision,
  callAzureDI,
  callLLM,
  buildTextMessages,
} from '@/lib/api-clients'
import { getStructurationPrompt } from '@/lib/prompts'

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { ocrProvider, correctionModelId, images, enonceImages } = body

    if (!ocrProvider || !correctionModelId || !images?.length || !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Parametres manquants' },
        { status: 400 }
      )
    }

    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      GOOGLE_VISION_API_KEY: process.env.GOOGLE_VISION_API_KEY,
      AZURE_DI_KEY: process.env.AZURE_DI_KEY,
      AZURE_DI_ENDPOINT: process.env.AZURE_DI_ENDPOINT,
    }

    // Step 1: Extract text via OCR
    let rawText = ''

    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) continue

      const mimeType = match[1]
      const base64Data = match[2]

      let pageText = ''

      switch (ocrProvider) {
        case 'mistral-ocr':
          pageText = await callMistralOCR(base64Data, mimeType, env.MISTRAL_API_KEY!)
          break
        case 'google-vision':
          pageText = await callGoogleVision(base64Data, env.GOOGLE_VISION_API_KEY!)
          break
        case 'azure-di':
          pageText = await callAzureDI(base64Data, env.AZURE_DI_ENDPOINT!, env.AZURE_DI_KEY!)
          break
        default:
          throw new Error(`OCR provider inconnu: ${ocrProvider}`)
      }

      rawText += pageText + '\n\n'
    }

    // Step 2: Structure the OCR text using the correction model
    const structPrompt = getStructurationPrompt(rawText.trim(), '[Voir enonce fourni]')
    const messages = buildTextMessages('', structPrompt)

    const structured = await callLLM(correctionModelId, messages, env)

    return NextResponse.json({ transcription: structured })
  } catch (err: unknown) {
    console.error('Erreur transcription OCR:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
