import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildCorrectionMessages, type ImageContent } from '@/lib/api-clients'
import { getCorrectionPromptParts } from '@/lib/prompts'
import { robustJsonParse, normalizeCorrection } from '@/lib/json-utils'
import { logLLMCall } from '@/lib/llm-logger'
import { TEXT_ONLY_MODELS } from '@/lib/types'

// Modèles Anthropic qui supportent le prefilling du message assistant
// Opus 4.6 a l'adaptive thinking par défaut → interdit le prefill
const ANTHROPIC_PREFILL_MODELS = new Set(['claude-haiku-4-5', 'claude-sonnet-4-5'])

// Modèles qui supportent le JSON mode natif (response_format ou responseMimeType)
const JSON_MODE_PROVIDERS = new Set(['openai', 'openai-responses', 'google', 'deepseek', 'xai', 'moonshot'])

// SEND_IMAGES=true (défaut) → envoie les images de l'énoncé/corrigé au LLM correcteur
// SEND_IMAGES=false → n'envoie que la transcription texte
const SEND_IMAGES = process.env.SEND_IMAGES !== 'false'

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[CORRECTION] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { modelId, matiere, classe, severite, baremeJson, mdCopie, enonceText, corrigeText, enonceImages, corrigeImages, previousCorrections } = body

    if (!modelId || !matiere || !classe || !severite || !baremeJson || !mdCopie) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    const prevCount = Array.isArray(previousCorrections) ? previousCorrections.length : 0
    log(`Début — modèle=${modelId}, copie=${mdCopie.length} chars, barème=${baremeJson.length} chars, ${prevCount} corrections précédentes`)
    if (enonceText) log(`📝 Énoncé texte fourni (${enonceText.length} chars) — sera mis en cache`)
    if (corrigeText) log(`📝 Corrigé texte fourni (${corrigeText.length} chars) — sera mis en cache`)

    // ─── Préparer les images si SEND_IMAGES=true et modèle multimodal ───
    const isTextOnly = TEXT_ONLY_MODELS.includes(modelId)
    const shouldSendImages = SEND_IMAGES && !isTextOnly
    let parsedImages: ImageContent[] = []

    if (shouldSendImages) {
      const rawImages: string[] = [
        ...(Array.isArray(enonceImages) ? enonceImages : []),
        ...(Array.isArray(corrigeImages) ? corrigeImages : []),
      ]
      for (const img of rawImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          parsedImages.push({ mimeType: match[1], base64: match[2] })
        }
      }
      if (parsedImages.length > 0) {
        const totalKb = Math.round(parsedImages.reduce((s, i) => s + i.base64.length, 0) / 1024)
        log(`🖼️ ${parsedImages.length} images jointes (${totalKb} KB) — SEND_IMAGES=true`)
      }
    } else if (isTextOnly) {
      log(`📄 Modèle text-only — images non envoyées`)
    } else {
      log(`📄 SEND_IMAGES=false — images non envoyées`)
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

    // ─── Séparer le prompt en parties cacheable / variable ───
    const { staticContext, variableContext } = getCorrectionPromptParts(
      matiere,
      classe,
      severite,
      baremeJson,
      mdCopie,
      enonceText || undefined,
      corrigeText || undefined,
      Array.isArray(previousCorrections) && previousCorrections.length > 0 ? previousCorrections : undefined
    )

    log(`Prompt construit — statique: ${staticContext.length} chars (cacheable), variable: ${variableContext.length} chars`)

    // ─── Construire les messages avec prompt caching + images optionnelles ───
    const messages = buildCorrectionMessages(
      staticContext,
      variableContext,
      modelId,
      parsedImages.length > 0 ? parsedImages : undefined
    )

    const provider = getProviderFromModel(modelId)
    const jsonMode = JSON_MODE_PROVIDERS.has(provider)
    const usePrefill = provider === 'anthropic' && ANTHROPIC_PREFILL_MODELS.has(modelId)

    if (usePrefill) {
      messages.push({ role: 'assistant', content: '{' })
    }

    log('Appel LLM...')
    let result = await callLLM(modelId, messages, env, { jsonMode })
    const elapsedMs = performance.now() - t0

    if (usePrefill && !result.startsWith('{')) {
      result = '{' + result
    }

    log('Réponse LLM reçue, parsing JSON...')

    // Parsing robuste + normalisation alignée sur le barème
    const parsed = robustJsonParse(result)
    const correction = normalizeCorrection(parsed, baremeJson)

    // Log asynchrone (non bloquant) — sans les images base64
    logLLMCall({
      type: 'correction',
      model: modelId,
      provider,
      prompt: { static: staticContext, variable: variableContext },
      messages: [{ role: 'user', content: `[prompt texte — ${parsedImages.length} images jointes non incluses dans le log]` }],
      options: { jsonMode, prefill: usePrefill },
      response_raw: result,
      response_parsed: correction,
      meta: {
        elapsed_ms: Math.round(elapsedMs),
        timestamp: new Date().toISOString(),
        send_images: shouldSendImages,
        images_count: parsedImages.length,
      },
    })

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
  }
  return map[modelId] || 'openai'
}
