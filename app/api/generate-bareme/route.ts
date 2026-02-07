import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { getBaremePrompt } from '@/lib/prompts'

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { modelId, matiere, classe, enonceImages, corrigeImages } = body

    if (!modelId || !matiere || !classe || !enonceImages?.length) {
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
    }

    // Build the prompt
    const prompt = getBaremePrompt(matiere, classe, '[Voir images ci-jointes]', corrigeImages?.length ? '[Voir images du corrige ci-jointes]' : undefined)

    // Build messages with images
    const allImages: ImageContent[] = []

    for (const img of enonceImages) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        allImages.push({ mimeType: match[1], base64: match[2] })
      }
    }

    if (corrigeImages?.length) {
      for (const img of corrigeImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          allImages.push({ mimeType: match[1], base64: match[2] })
        }
      }
    }

    const provider = getProviderFromModel(modelId)

    let result: string

    if (provider === 'google') {
      const parts = buildMessagesWithImages(prompt, allImages, modelId)
      result = await callLLM(modelId, parts, env)
    } else if (allImages.length > 0 && provider !== 'deepseek') {
      const messages = buildMessagesWithImages(prompt, allImages, modelId)
      result = await callLLM(modelId, messages, env)
    } else {
      const messages = buildTextMessages('', prompt)
      result = await callLLM(modelId, messages, env)
    }

    // Parse JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Reponse invalide du modele' },
        { status: 500 }
      )
    }

    const bareme = JSON.parse(jsonMatch[0])
    return NextResponse.json({ bareme })
  } catch (err: unknown) {
    console.error('Erreur generation bareme:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getProviderFromModel (modelId: string): string {
  const map: Record<string, string> = {
    'gpt-4o-mini': 'openai',
    'gpt-5-nano': 'openai',
    'claude-haiku-4-5': 'anthropic',
    'claude-sonnet-4-5': 'anthropic',
    'claude-opus-4-6': 'anthropic',
    'gemini-3-flash': 'google',
    'gemini-3-pro': 'google',
    'deepseek-v3.2': 'deepseek',
    'kimi-k2.5': 'moonshot',
    'kimi-k2-thinking': 'moonshot',
    'grok-4-1-fast': 'xai',
    'grok-4-1-fast-reasoning': 'xai',
  }
  return map[modelId] || 'openai'
}
