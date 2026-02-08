import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { getBaremePrompt } from '@/lib/prompts'
import { robustJsonParse, normalizeBareme } from '@/lib/json-utils'

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { modelId, matiere, classe, enonceImages, corrigeImages } = body

    if (!modelId || !matiere || !classe || !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
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

    // Construire le prompt
    const prompt = getBaremePrompt(matiere, classe, '[Voir images ci-jointes]', corrigeImages?.length ? '[Voir images du corrigé ci-jointes]' : undefined)

    // Construire les images
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

    const jsonMode = provider !== 'anthropic'

    if (provider === 'google') {
      const parts = buildMessagesWithImages(prompt, allImages, modelId)
      result = await callLLM(modelId, parts, env, { jsonMode })
    } else if (allImages.length > 0 && provider !== 'deepseek') {
      const messages = buildMessagesWithImages(prompt, allImages, modelId)

      // Prefilling pour Anthropic : forcer le début du JSON
      if (provider === 'anthropic') {
        messages.push({ role: 'assistant', content: '{' })
      }

      result = await callLLM(modelId, messages, env, { jsonMode })

      // Reconstituer le JSON si prefill utilisé
      if (provider === 'anthropic' && !result.startsWith('{')) {
        result = '{' + result
      }
    } else {
      const messages = buildTextMessages('', prompt)

      if (provider === 'anthropic') {
        messages.push({ role: 'assistant', content: '{' })
      }

      result = await callLLM(modelId, messages, env, { jsonMode })

      if (provider === 'anthropic' && !result.startsWith('{')) {
        result = '{' + result
      }
    }

    // Parsing robuste + normalisation
    const parsed = robustJsonParse(result)
    const bareme = normalizeBareme(parsed)

    // Si aucune question n'a pu être extraite, créer un barème minimal éditable
    if (bareme.questions.length === 0) {
      console.warn('Barème : aucune question extraite, création d\'un barème par défaut')
      bareme.total = 20
      bareme.questions = [
        {
          id: '1',
          titre: 'Item 1 — À compléter',
          points: 20,
          criteres: ['Critère à définir par le professeur'],
        },
      ]
    }

    return NextResponse.json({ bareme })
  } catch (err: unknown) {
    console.error('Erreur génération barème:', err)
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
