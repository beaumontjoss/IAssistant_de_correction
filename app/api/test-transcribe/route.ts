import { NextRequest, NextResponse } from 'next/server'
import {
  callLLM,
  callMistralOCR,
  buildMessagesWithImages,
  type ImageContent,
} from '@/lib/api-clients'

const OCR_PROVIDERS = ['mistral-ocr']

const SIMPLE_TRANSCRIPTION_PROMPT = `Tu es un assistant de transcription fidèle. Tu reçois une ou plusieurs images d'un document manuscrit.

Ta tâche :
1. Lis attentivement chaque image
2. Transcris FIDÈLEMENT tout le texte manuscrit visible, en conservant TOUTES les erreurs (orthographe, grammaire, conjugaison)
3. Structure la transcription en Markdown propre
4. Si un mot ou passage est illisible, écris [illisible]

ADAPTATION AU TYPE DE DOCUMENT :
- S'il s'agit de réponses à des questions, structure par question (## Question 1, ## Question 2, etc.)
- S'il s'agit d'une dissertation ou rédaction, structure en paragraphes fidèles
- S'il s'agit d'une dictée, retranscris en un seul bloc continu
- Pour tout autre type de document (commentaire de texte, étude de document, traduction, schéma annoté, etc.) : adapte la structure Markdown au format le plus fidèle au contenu original
- Dans tous les cas, retranscris fidèlement sans rien corriger

RÈGLE ABSOLUE : Ne corrige AUCUNE erreur. Ta transcription doit être un miroir exact de ce qui est écrit.

Format de sortie en Markdown structuré.`

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { modelId, images } = body

    if (!modelId || !images?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants : modelId et images requis' },
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
    }

    const startTime = Date.now()

    // --- OCR-dedicated providers ---
    if (OCR_PROVIDERS.includes(modelId)) {
      let rawText = ''

      for (const img of images) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) continue

        const mimeType = match[1]
        const base64Data = match[2]

        if (modelId === 'mistral-ocr') {
          rawText += await callMistralOCR(base64Data, mimeType, env.MISTRAL_API_KEY!)
        }

        rawText += '\n\n'
      }

      const elapsed = Date.now() - startTime
      return NextResponse.json({
        transcription: rawText.trim(),
        model: modelId,
        elapsed_ms: elapsed,
      })
    }

    // --- Multimodal LLM providers ---
    const allImages: ImageContent[] = []

    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        allImages.push({ mimeType: match[1], base64: match[2] })
      }
    }

    const provider = getProvider(modelId)

    let result: string

    if (provider === 'google') {
      // Gemini uses parts format
      const parts = buildMessagesWithImages(SIMPLE_TRANSCRIPTION_PROMPT, allImages, modelId)
      result = await callLLM(modelId, parts, env)
    } else {
      const messages = buildMessagesWithImages(SIMPLE_TRANSCRIPTION_PROMPT, allImages, modelId)
      result = await callLLM(modelId, messages, env)
    }

    const elapsed = Date.now() - startTime
    return NextResponse.json({
      transcription: result,
      model: modelId,
      elapsed_ms: elapsed,
    })
  } catch (err: unknown) {
    console.error('Erreur test-transcribe:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getProvider (modelId: string): string {
  const map: Record<string, string> = {
    'gpt-4o-mini': 'openai',
    'gpt-5-nano': 'openai',
    'claude-haiku-4-5': 'anthropic',
    'claude-sonnet-4-5': 'anthropic',
    'claude-opus-4-6': 'anthropic',
    'gemini-3-flash': 'google',
    'gemini-3-pro': 'google',
    'kimi-k2.5': 'moonshot',
    'grok-4': 'xai',
  }
  return map[modelId] || 'openai'
}

// Increase body size limit for base64 images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}
