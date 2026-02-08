import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { getBaremePrompt } from '@/lib/prompts'
import { robustJsonParse, normalizeBareme } from '@/lib/json-utils'

// Modèles Anthropic qui supportent le prefilling du message assistant
// Opus 4.6 a l'adaptive thinking par défaut → interdit le prefill
const ANTHROPIC_PREFILL_MODELS = new Set(['claude-haiku-4-5', 'claude-sonnet-4-5'])

// Modèles qui supportent le JSON mode natif (response_format ou responseMimeType)
// Moonshot/Kimi ne supporte PAS response_format
const JSON_MODE_PROVIDERS = new Set(['openai', 'google', 'deepseek', 'xai'])

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[BARÈME] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { modelId, matiere, classe, enonceImages, corrigeImages } = body

    if (!modelId || !matiere || !classe || !enonceImages?.length) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    log(`Début — modèle=${modelId}, ${enonceImages.length} img énoncé, ${corrigeImages?.length ?? 0} img corrigé`)

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
    log(`Prompt construit (${prompt.length} chars)`)

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

    const totalImgSize = allImages.reduce((sum, img) => sum + img.base64.length, 0)
    log(`${allImages.length} images préparées (${(totalImgSize / 1024).toFixed(0)} KB base64)`)

    const provider = getProviderFromModel(modelId)
    const jsonMode = JSON_MODE_PROVIDERS.has(provider)
    const usePrefill = provider === 'anthropic' && ANTHROPIC_PREFILL_MODELS.has(modelId)

    let result: string

    log('Appel LLM...')

    if (provider === 'google') {
      const parts = buildMessagesWithImages(prompt, allImages, modelId)
      result = await callLLM(modelId, parts, env, { jsonMode })
    } else if (allImages.length > 0 && provider !== 'deepseek') {
      const messages = buildMessagesWithImages(prompt, allImages, modelId)

      if (usePrefill) {
        messages.push({ role: 'assistant', content: '{' })
      }

      result = await callLLM(modelId, messages, env, { jsonMode })

      if (usePrefill && !result.startsWith('{')) {
        result = '{' + result
      }
    } else {
      const messages = buildTextMessages('', prompt)

      if (usePrefill) {
        messages.push({ role: 'assistant', content: '{' })
      }

      result = await callLLM(modelId, messages, env, { jsonMode })

      if (usePrefill && !result.startsWith('{')) {
        result = '{' + result
      }
    }

    log('Réponse LLM reçue, parsing JSON...')

    // Parsing robuste + normalisation
    const parsed = robustJsonParse(result)
    const bareme = normalizeBareme(parsed)

    // Si aucune question n'a pu être extraite, créer un barème minimal éditable
    if (bareme.questions.length === 0) {
      log('⚠️ Aucune question extraite → barème par défaut')
      bareme.total = 20
      bareme.questions = [
        {
          id: '1',
          titre: 'Item 1 — À compléter',
          points: 20,
          criteres: [{ question: '', description: 'Critère à définir par le professeur', points: 20 }],
        },
      ]
    }

    log(`✅ Terminé — ${bareme.questions.length} sections, ${bareme.total} pts`)
    return NextResponse.json({ bareme })
  } catch (err: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[BARÈME] ❌ ${elapsed}s — Erreur:`, err)
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
    'grok-4': 'xai',
  }
  return map[modelId] || 'openai'
}
