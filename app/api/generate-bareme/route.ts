export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { getBaremePrompt, BAREME_JSON_SCHEMA } from '@/lib/prompts'
import { robustJsonParse, normalizeBareme } from '@/lib/json-utils'
import { logLLMCall } from '@/lib/llm-logger'

// Modèles qui supportent le JSON mode natif (response_format ou responseMimeType)
const JSON_MODE_PROVIDERS = new Set(['openai', 'openai-responses', 'google', 'deepseek', 'xai', 'moonshot', 'mistral-chat'])

// Prompt pour transcrire des images de document en texte
// Contexte éducatif explicite pour éviter le filtre RECITATION de Gemini
const TRANSCRIPTION_DOC_PROMPT = `Tu es un assistant pédagogique qui aide un enseignant à numériser ses documents de cours.
L'enseignant te fournit des photos d'un document scolaire (contrôle, exercice, ou corrigé) qu'il a lui-même rédigé.
Ton rôle est de produire une version texte structurée de ce document pour qu'il puisse l'utiliser dans son outil de correction.

Instructions :
- Restitue le contenu complet du document en Markdown.
- Conserve la structure originale (titres, numérotation, sous-parties, consignes).
- Sois fidèle au contenu : n'invente rien, ne résume pas.
- Si un passage est difficile à lire, fais de ton mieux et signale les incertitudes avec [illisible].

Pour les éléments visuels (graphiques, schémas, figures, cartes, diagrammes) :
- Décris-les en détail entre balises [FIGURE: ...]
- Précise : type de visuel, axes et légendes, valeurs chiffrées, formes géométriques, relations spatiales, couleurs significatives
- Exemple : [FIGURE: Graphique en barres montrant la température moyenne (°C) en ordonnée et les mois (Jan-Déc) en abscisse. Valeurs : Jan=5, Fév=6, Mar=10, Avr=13, Mai=17, Jun=21, Jul=24, Aoû=23, Sep=20, Oct=15, Nov=9, Déc=6]
- Exemple : [FIGURE: Triangle ABC rectangle en A. AB = 5 cm, AC = 12 cm. Angle B marqué α. Hauteur AH tracée vers BC.]

Pour les tableaux, utilise la syntaxe Markdown de tableau.
Pour les formules mathématiques, utilise la notation LaTeX entre $ ou $$.`

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[BARÈME] ${elapsed}s — ${step}`)
  }

  // ─── Parse body avant le stream ────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const { modelId, matiere, classe, enonceImages, corrigeImages, enonceText: existingEnonceText, corrigeText: existingCorrigeText } = body

  if (!modelId || !matiere || !classe || (!enonceImages?.length && !existingEnonceText)) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  // ─── SSE Stream ────────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start (controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('step', { message: 'Préparation du prompt…' })
        log(`Début — modèle=${modelId}`)

        const env = {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
          MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
          MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
          XAI_API_KEY: process.env.XAI_API_KEY,
        }

        // ─── Préparer les images ──────────────────────────
        const enonceImgParsed: ImageContent[] = []
        for (const img of (enonceImages || [])) {
          const match = img.match(/^data:([^;]+);base64,(.+)$/)
          if (match) enonceImgParsed.push({ mimeType: match[1], base64: match[2] })
        }

        const corrigeImgParsed: ImageContent[] = []
        for (const img of (corrigeImages || [])) {
          const match = img.match(/^data:([^;]+);base64,(.+)$/)
          if (match) corrigeImgParsed.push({ mimeType: match[1], base64: match[2] })
        }

        const allImages = [...enonceImgParsed, ...corrigeImgParsed]
        const totalImgSize = allImages.reduce((sum, img) => sum + img.base64.length, 0)

        const provider = getProviderFromModel(modelId)
        const jsonMode = JSON_MODE_PROVIDERS.has(provider)
        const useStructuredOutput = provider === 'anthropic' && modelId !== 'claude-opus-4-6'

        const hasEnonceText = !!existingEnonceText
        const hasCorrigeText = !!existingCorrigeText
        const useTextMode = hasEnonceText

        // ─── Construire le prompt ──────────────────────────
        const enonceContent = useTextMode ? existingEnonceText : '[Voir images de l\'énoncé ci-jointes]'
        const corrigeContent = useTextMode && hasCorrigeText
          ? existingCorrigeText
          : (!useTextMode && corrigeImgParsed.length > 0)
            ? '[Voir images du corrigé ci-jointes]'
            : undefined

        const prompt = getBaremePrompt(matiere, classe, enonceContent, corrigeContent ?? undefined)
        log(`Prompt construit (${prompt.length} chars) — mode ${useTextMode ? 'texte' : 'images'}`)

        const llmOptions: Record<string, any> = { jsonMode }
        if (useStructuredOutput) {
          llmOptions.anthropicSchema = BAREME_JSON_SCHEMA
        }

        // ─── Appel LLM ─────────────────────────────────────
        send('step', { message: 'Génération du barème en cours…' })

        const baremePromise = (async () => {
          if (useTextMode) {
            const messages = buildTextMessages('', prompt)
            return await callLLM(modelId, messages, env, llmOptions)
          } else if (provider === 'google') {
            const parts = buildMessagesWithImages(prompt, allImages, modelId)
            return await callLLM(modelId, parts, env, llmOptions)
          } else if (allImages.length > 0 && provider !== 'deepseek') {
            const messages = buildMessagesWithImages(prompt, allImages, modelId)
            return await callLLM(modelId, messages, env, llmOptions)
          } else {
            const messages = buildTextMessages('', prompt)
            return await callLLM(modelId, messages, env, llmOptions)
          }
        })()

        // Transcriptions en parallèle (si pas déjà faites)
        const enonceTextPromise = existingEnonceText
          ? Promise.resolve(existingEnonceText as string)
          : transcribeDocImages(enonceImgParsed, env, log, 'énoncé')

        const corrigeTextPromise = existingCorrigeText
          ? Promise.resolve(existingCorrigeText as string)
          : corrigeImgParsed.length > 0
            ? transcribeDocImages(corrigeImgParsed, env, log, 'corrigé')
            : Promise.resolve(null)

        const [baremeResult, enonceText, corrigeText] = await Promise.all([
          baremePromise,
          enonceTextPromise,
          corrigeTextPromise,
        ])

        // ─── Parsing ──────────────────────────────────────
        send('step', { message: 'Structuration du barème…' })
        log('Réponses reçues, parsing JSON du barème...')
        const elapsedMs = performance.now() - t0

        const parsed = robustJsonParse(baremeResult)
        const bareme = normalizeBareme(parsed)

        if (bareme.questions.length === 0) {
          log('⚠️ Aucune question extraite → barème par défaut')
          bareme.total = 20
          bareme.questions = [{
            id: '1',
            titre: 'Item 1 — À compléter',
            points: 20,
            criteres: [{ question: '', description: 'Critère à définir par le professeur', points: 20 }],
          }]
        }

        // Log asynchrone
        const logContent = useTextMode
          ? prompt
          : `${prompt}\n\n[${allImages.length} images jointes — non incluses dans le log]`
        logLLMCall({
          type: 'bareme',
          model: modelId,
          provider,
          prompt: { full: prompt },
          messages: [{ role: 'user', content: logContent }],
          options: { jsonMode },
          response_raw: baremeResult,
          response_parsed: bareme,
          meta: {
            elapsed_ms: Math.round(elapsedMs),
            timestamp: new Date().toISOString(),
            mode: useTextMode ? 'text' : 'images',
            images_count: useTextMode ? 0 : allImages.length,
            images_size_kb: useTextMode ? 0 : Math.round(totalImgSize / 1024),
          },
        })

        log(`✅ Terminé — ${bareme.questions.length} sections, ${bareme.total} pts`)

        // ─── Envoi du résultat ─────────────────────────────
        send('result', { bareme, enonceText, corrigeText })
      } catch (err) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
        console.error(`[BARÈME] ❌ ${elapsed}s — Erreur:`, err)
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        send('error', { error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/**
 * Transcrit des images de document en texte via Gemini 3 Flash (rapide, multimodal, pas cher).
 * Retourne null en cas d'erreur (non bloquant pour le barème).
 */
async function transcribeDocImages (
  images: ImageContent[],
  env: Record<string, string | undefined>,
  log: (s: string) => void,
  label: string
): Promise<string | null> {
  try {
    const messages = buildMessagesWithImages(TRANSCRIPTION_DOC_PROMPT, images, 'gemini-3-flash')
    const result = await callLLM('gemini-3-flash', messages, env)
    log(`✅ Transcription ${label} terminée`)
    return result
  } catch (err) {
    log(`⚠️ Transcription ${label} échouée (non bloquant) : ${err instanceof Error ? err.message : 'erreur'}`)
    return null
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
