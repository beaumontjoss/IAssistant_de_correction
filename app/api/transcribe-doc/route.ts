import { NextRequest, NextResponse } from 'next/server'
import { callLLM, callMistralOCR, buildMessagesWithImages, type ImageContent } from '@/lib/api-clients'
import { logLLMCall } from '@/lib/llm-logger'

// Prompt reformulé pour éviter le filtre RECITATION de Gemini :
// - contexte éducatif explicite
// - reformulation autorisée si blocage
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

// Modèles à essayer dans l'ordre (fallback si RECITATION ou erreur)
// 'mistral-ocr' est traité à part car API différente (OCR dédié, image par image)
const TRANSCRIPTION_MODELS = ['gemini-3-flash', 'gemini-3-pro', 'mistral-ocr'] as const

export async function POST (req: NextRequest) {
  const t0 = performance.now()
  const log = (step: string) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[TRANSCRIBE-DOC] ${elapsed}s — ${step}`)
  }

  try {
    const body = await req.json()
    const { images } = body

    if (!images?.length) {
      return NextResponse.json({ error: 'Images manquantes' }, { status: 400 })
    }

    log(`Début — ${images.length} images`)

    const env = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    }

    // Parser les images
    const parsed: ImageContent[] = []
    for (const img of images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        parsed.push({ mimeType: match[1], base64: match[2] })
      }
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Aucune image valide' }, { status: 400 })
    }

    const totalKb = Math.round(parsed.reduce((s, i) => s + i.base64.length, 0) / 1024)
    log(`${parsed.length} images (${totalKb} KB)`)

    // Essayer les modèles dans l'ordre avec fallback
    let lastError: Error | null = null
    const failedModels: string[] = []

    for (const modelId of TRANSCRIPTION_MODELS) {
      try {
        log(`Appel ${modelId}...`)

        let result: string
        let promptSent: string

        if (modelId === 'mistral-ocr') {
          // Mistral OCR : API dédiée, traite une image à la fois → concaténer les résultats
          const mistralKey = env.MISTRAL_API_KEY
          if (!mistralKey) throw new Error('MISTRAL_API_KEY manquante')

          const pages = await Promise.all(
            parsed.map((img) => callMistralOCR(img.base64, img.mimeType, mistralKey))
          )
          result = pages.join('\n\n---\n\n')
          promptSent = `[Mistral OCR — ${parsed.length} images envoyées individuellement, pas de prompt textuel]`
        } else {
          // Gemini : multimodal, toutes les images en une seule requête
          const messages = buildMessagesWithImages(TRANSCRIPTION_DOC_PROMPT, parsed, modelId)
          result = await callLLM(modelId, messages, env)
          promptSent = TRANSCRIPTION_DOC_PROMPT
        }

        if (!result || result.trim().length < 20) {
          throw new Error(`Réponse trop courte (${result?.length ?? 0} chars)`)
        }

        const elapsedMs = performance.now() - t0
        log(`✅ ${modelId} — Terminé (${result.length} chars)`)

        // Log du prompt envoyé + réponse complète
        logLLMCall({
          type: 'transcription-doc',
          model: modelId,
          provider: modelId === 'mistral-ocr' ? 'mistral' : 'google',
          prompt: { full: promptSent },
          messages: [{ role: 'user', content: `${promptSent}\n\n[${parsed.length} images jointes — non incluses dans le log]` }],
          options: {},
          response_raw: result,
          response_parsed: null,
          meta: {
            elapsed_ms: Math.round(elapsedMs),
            timestamp: new Date().toISOString(),
            images_count: parsed.length,
            images_size_kb: Math.round(totalKb),
            failed_models: failedModels.length > 0 ? failedModels : undefined,
          },
        })

        return NextResponse.json({ text: result })
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const isRecitation = lastError.message.includes('RECITATION')
        log(`⚠️ ${modelId} échoué${isRecitation ? ' (RECITATION)' : ''} : ${lastError.message}`)
        failedModels.push(`${modelId}: ${lastError.message}`)
        // Continuer vers le modèle suivant
      }
    }

    // Tous les modèles ont échoué
    throw lastError ?? new Error('Tous les modèles de transcription ont échoué')
  } catch (err: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[TRANSCRIBE-DOC] ❌ ${elapsed}s — Erreur:`, err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
