export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildCorrectionMessages } from '@/lib/api-clients'
import { getCorrectionPromptParts, CORRECTION_JSON_SCHEMA } from '@/lib/prompts'
import { robustJsonParse, normalizeCorrection } from '@/lib/json-utils'
import { logLLMCall } from '@/lib/llm-logger'

// Modèles qui supportent le JSON mode natif (response_format ou responseMimeType)
const JSON_MODE_PROVIDERS = new Set(['openai', 'openai-responses', 'google', 'deepseek', 'xai', 'moonshot', 'mistral-chat'])

// Fallbacks par modèle : si le modèle principal échoue, on essaie les suivants
const FALLBACK_MODELS: Record<string, string[]> = {
  'deepseek-v3.2': ['mistral-large', 'gemini-3-pro'],
}

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[CORRECTION] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { modelId, matiere, classe, severite, baremeJson, mdCopie, enonceText, corrigeText } = body

    if (!modelId || !matiere || !classe || !severite || !baremeJson || !mdCopie) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    log(`Début — modèle=${modelId}, copie=${mdCopie.length} chars, barème=${baremeJson.length} chars`)
    if (enonceText) log(`📝 Énoncé fourni (${enonceText.length} chars) — sera mis en cache`)
    if (corrigeText) log(`📝 Corrigé fourni (${corrigeText.length} chars) — sera mis en cache`)

    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
    }

    // ─── Séparer le prompt en parties cacheable / variable ───
    const { staticContext, variableContext } = getCorrectionPromptParts(
      matiere,
      classe,
      severite,
      baremeJson,
      mdCopie,
      enonceText || undefined,
      corrigeText || undefined
    )

    log(`Prompt construit — statique: ${staticContext.length} chars (cacheable), variable: ${variableContext.length} chars`)

    // ─── Pipeline de correction avec fallback ───
    const modelsToTry = [modelId, ...(FALLBACK_MODELS[modelId] || [])]
    const errors: string[] = []

    for (const currentModel of modelsToTry) {
      try {
        const messages = buildCorrectionMessages(staticContext, variableContext, currentModel)
        const provider = getProviderFromModel(currentModel)
        const jsonMode = JSON_MODE_PROVIDERS.has(provider)
        const useStructuredOutput = provider === 'anthropic' && currentModel !== 'claude-opus-4-6'

        const llmOptions: Record<string, any> = { jsonMode }
        if (useStructuredOutput) {
          llmOptions.anthropicSchema = CORRECTION_JSON_SCHEMA
          log('Structured outputs activés (Anthropic json_schema)')
        }

        log(`Appel LLM ${currentModel}...`)
        const result = await callLLM(currentModel, messages, env, llmOptions)
        const elapsedMs = performance.now() - t0

        log('Réponse LLM reçue, parsing JSON...')

        const parsed = robustJsonParse(result)
        const correction = normalizeCorrection(parsed, baremeJson)

        // Log asynchrone (non bloquant)
        logLLMCall({
          type: 'correction',
          model: currentModel,
          provider,
          prompt: { static: staticContext, variable: variableContext },
          messages,
          options: { jsonMode },
          response_raw: result,
          response_parsed: correction,
          meta: {
            elapsed_ms: Math.round(elapsedMs),
            timestamp: new Date().toISOString(),
            failed_models: errors.length > 0 ? errors : undefined,
          },
        })

        if (!correction || correction.questions.length === 0) {
          const msg = `${currentModel}: correction non exploitable`
          log(`⚠️ ${msg}`)
          errors.push(msg)
          continue
        }

        if (currentModel !== modelId) {
          log(`✅ Terminé via fallback ${currentModel} — note=${correction.note_globale}/${correction.total}, ${correction.questions.length} questions`)
        } else {
          log(`✅ Terminé — note=${correction.note_globale}/${correction.total}, ${correction.questions.length} questions`)
        }
        return NextResponse.json({ correction, model: currentModel })
      } catch (err) {
        const msg = `${currentModel}: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
        log(`⚠️ Échec ${msg}`)
        errors.push(msg)
      }
    }

    // Tous les modèles ont échoué
    log('❌ Tous les modèles ont échoué')
    return NextResponse.json(
      { error: `Correction impossible :\n${errors.join('\n')}` },
      { status: 500 }
    )
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
    'gpt-5.2-pro': 'openai-responses',
    'gpt-5.2': 'openai',
    'claude-haiku-4-5': 'anthropic',
    'claude-sonnet-4-5': 'anthropic',
    'claude-opus-4-6': 'anthropic',
    'gemini-3-flash': 'google',
    'gemini-3-pro': 'google',
    'deepseek-v3.2': 'deepseek',
    'kimi-k2.5': 'moonshot',
    'kimi-k2-thinking': 'moonshot',
    'grok-4': 'xai',
    'mistral-large': 'mistral-chat',
  }
  return map[modelId] || 'openai'
}
