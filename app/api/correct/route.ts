import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages } from '@/lib/api-clients'
import { getCorrectionPrompt } from '@/lib/prompts'
import { robustJsonParse, normalizeCorrection } from '@/lib/json-utils'

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
    console.log(`[CORRECTION] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { modelId, matiere, classe, severite, baremeJson, mdCopie, corrigeText, previousCorrections } = body

    if (!modelId || !matiere || !classe || !severite || !baremeJson || !mdCopie) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    const prevCount = Array.isArray(previousCorrections) ? previousCorrections.length : 0
    log(`Début — modèle=${modelId}, copie=${mdCopie.length} chars, barème=${baremeJson.length} chars, ${prevCount} corrections précédentes`)

    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
    }

    const prompt = getCorrectionPrompt(
      matiere,
      classe,
      severite,
      baremeJson,
      mdCopie,
      corrigeText || undefined,
      Array.isArray(previousCorrections) && previousCorrections.length > 0 ? previousCorrections : undefined
    )

    log(`Prompt construit (${prompt.length} chars)`)

    const messages = buildTextMessages('', prompt)

    const provider = getProviderFromModel(modelId)
    const jsonMode = JSON_MODE_PROVIDERS.has(provider)
    const usePrefill = provider === 'anthropic' && ANTHROPIC_PREFILL_MODELS.has(modelId)

    if (usePrefill) {
      messages.push({ role: 'assistant', content: '{' })
    }

    log('Appel LLM...')
    let result = await callLLM(modelId, messages, env, { jsonMode })

    if (usePrefill && !result.startsWith('{')) {
      result = '{' + result
    }

    log('Réponse LLM reçue, parsing JSON...')

    // Parsing robuste + normalisation alignée sur le barème
    const parsed = robustJsonParse(result)
    const correction = normalizeCorrection(parsed, baremeJson)

    if (!correction || correction.questions.length === 0) {
      log('⚠️ Correction non exploitable')
      return NextResponse.json(
        { error: 'Le modèle n\'a pas renvoyé une correction exploitable. Réessayez.' },
        { status: 500 }
      )
    }

    log(`✅ Terminé — note=${correction.note_globale}/${correction.total}, ${correction.questions.length} questions`)
    return NextResponse.json({ correction })
  } catch (err: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[CORRECTION] ❌ ${elapsed}s — Erreur:`, err)
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
