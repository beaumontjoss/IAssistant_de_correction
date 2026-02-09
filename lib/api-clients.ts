/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Helper : fetch avec retry automatique sur erreurs réseau ──
async function fetchWithRetry (
  url: string,
  init: RequestInit,
  label: string,
  maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const t0 = performance.now()
      const res = await fetch(url, init)
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
      console.log(`[FETCH] ${label} — ${res.status} en ${elapsed}s`)
      return res
    } catch (err) {
      // Ne pas retrier si le serveur a fermé le socket (cause longue)
      const cause = (err as any)?.cause
      const isSlowSocketError = cause?.code === 'UND_ERR_SOCKET'

      if (attempt < maxRetries && !isSlowSocketError) {
        console.warn(`[FETCH] ${label} : tentative ${attempt + 1} échouée (réseau), retry dans ${2 * (attempt + 1)}s...`)
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }

      if (isSlowSocketError) {
        console.error(`[FETCH] ${label} : connexion refusée par le serveur (socket closed), pas de retry`)
      }
      throw err
    }
  }
  throw new Error(`${label} : échec réseau après ${maxRetries + 1} tentatives`)
}

// ─── OpenAI Chat Completions ──────────────────────────────
export async function callOpenAI (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const modelMap: Record<string, string> = {
    'gpt-4o-mini': 'gpt-4o-mini-2024-07-18',
    'gpt-5-nano': 'gpt-5-nano-2025-08-07',
    'gpt-5.2': 'gpt-5.2-2025-12-11',
  }

  const body: any = {
    model: modelMap[model] || model,
    messages,
  }

  // GPT-5 Nano ne supporte pas temperature != 1
  if (model !== 'gpt-5-nano') {
    body.temperature = 0
    body.seed = 42
  }

  // JSON mode pour forcer une sortie JSON valide
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    'OpenAI'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAI API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── OpenAI Responses API (GPT-5.2 Pro, etc.) ────────────
// Ces modèles ne supportent PAS Chat Completions, uniquement /v1/responses
const OPENAI_RESPONSES_MODELS = new Set(['gpt-5.2-pro'])

export async function callOpenAIResponses (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const modelMap: Record<string, string> = {
    'gpt-5.2-pro': 'gpt-5.2-pro-2025-12-11',
  }

  // Extraire les instructions (system) et l'input (user) depuis les messages
  let instructions: string | undefined
  const inputItems: any[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      instructions = typeof msg.content === 'string' ? msg.content : ''
    } else if (msg.role === 'user') {
      inputItems.push({
        role: 'user',
        content: typeof msg.content === 'string'
          ? msg.content
          : msg.content,
      })
    } else if (msg.role === 'assistant') {
      inputItems.push({
        role: 'assistant',
        content: typeof msg.content === 'string'
          ? msg.content
          : msg.content,
      })
    }
  }

  const body: any = {
    model: modelMap[model] || model,
    input: inputItems.length === 1 && typeof inputItems[0].content === 'string'
      ? inputItems[0].content
      : inputItems,
    store: false,
    reasoning: { effort: 'medium' },
  }

  if (instructions) {
    body.instructions = instructions
  }

  if (options?.jsonMode) {
    body.text = { format: { type: 'json_object' } }
  }

  console.log(`[OpenAI Responses] model=${model}, reasoning=medium, input_items=${inputItems.length}`)

  const res = await fetchWithRetry(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    'OpenAI-Responses'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAI Responses API error: ${res.status} — ${error}`)
  }

  const data = await res.json()

  // Log token usage
  if (data.usage) {
    const cached = data.usage.input_tokens_details?.cached_tokens ?? 0
    console.log(`[OpenAI Responses] 💾 Tokens — input: ${data.usage.input_tokens} (cached: ${cached}), output: ${data.usage.output_tokens}`)
  }

  // Extraire le texte de la réponse
  const messageOutput = data.output?.find((o: any) => o.type === 'message')
  const textContent = messageOutput?.content?.find((c: any) => c.type === 'output_text')

  if (!textContent?.text) {
    throw new Error('OpenAI Responses API : réponse vide ou format inattendu')
  }

  return textContent.text
}

// ─── Anthropic ────────────────────────────────────────────
// Opus 4.6 : adaptive thinking + structured outputs + 128K output
const ANTHROPIC_ADAPTIVE_MODELS = new Set(['claude-opus-4-6'])

export async function callAnthropic (
  model: string,
  messages: any[],
  apiKey: string,
  options?: LLMOptions
) {
  const modelMap: Record<string, string> = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
    'claude-opus-4-6': 'claude-opus-4-6',
  }

  const isAdaptive = ANTHROPIC_ADAPTIVE_MODELS.has(model)

  // Anthropic utilise un paramètre `system` de premier niveau, pas role: "system"
  let systemContent: string | any[] | undefined
  const filteredMessages = messages.filter((m) => {
    if (m.role === 'system') {
      systemContent = m.content
      return false
    }
    return true
  })

  const body: any = {
    model: modelMap[model] || model,
    messages: filteredMessages,
    // Opus 4.6 supporte 128K output ; 64K laisse de la marge pour thinking + réponse
    max_tokens: isAdaptive ? 64000 : 8192,
  }

  if (isAdaptive) {
    // Adaptive thinking — Claude décide quand et combien réfléchir
    // Pas de temperature avec adaptive thinking
    body.thinking = { type: 'adaptive' }
  } else {
    body.temperature = 0
  }

  if (systemContent) {
    body.system = systemContent
  }

  // Structured outputs : garantir un JSON valide via output_config.format
  if (options?.anthropicSchema) {
    body.output_config = {
      format: {
        type: 'json_schema',
        schema: options.anthropicSchema,
      },
    }
    console.log(`[Anthropic] 📐 Structured outputs activés (json_schema)`)
  }

  // Détecter si le prompt utilise du caching (blocs avec cache_control)
  const hasCaching = Array.isArray(systemContent)
    || filteredMessages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((b: any) => b.cache_control)
    )

  if (hasCaching) {
    console.log(`[Anthropic] model=${model}, adaptive=${isAdaptive}, prompt_caching=ON, max_tokens=${body.max_tokens}`)
  } else {
    console.log(`[Anthropic] model=${model}, adaptive=${isAdaptive}, max_tokens=${body.max_tokens}`)
  }

  const res = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    'Anthropic'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Anthropic API error: ${res.status} — ${error}`)
  }

  const data = await res.json()

  // Log usage et cache
  if (data.usage) {
    const u = data.usage
    const parts = [`input=${u.input_tokens ?? '?'}`, `output=${u.output_tokens ?? '?'}`]
    if (u.cache_read_input_tokens) parts.push(`cache_read=${u.cache_read_input_tokens}`)
    if (u.cache_creation_input_tokens) parts.push(`cache_write=${u.cache_creation_input_tokens}`)
    console.log(`[Anthropic] 📊 Usage — ${parts.join(', ')}`)
  }

  // Log stop reason pour détecter les troncatures
  if (data.stop_reason && data.stop_reason !== 'end_turn') {
    console.warn(`[Anthropic] ⚠️ stop_reason=${data.stop_reason} (réponse potentiellement tronquée)`)
  }

  // Adaptive/thinking models renvoient [{type:"thinking",...}, {type:"text",...}]
  const textBlock = data.content.find((b: any) => b.type === 'text')

  if (textBlock && textBlock.text.length > 10) {
    return textBlock.text
  }

  // Fallback : si le bloc texte est trop court, chercher du JSON dans le thinking.
  // Regex générique : cherche tout objet JSON avec au moins une clé commune
  if (isAdaptive) {
    const thinkingBlocks = data.content.filter((b: any) => b.type === 'thinking')
    for (const tb of thinkingBlocks.reverse()) {
      const thinking = tb.thinking || ''
      // Chercher un gros bloc JSON (barème: "questions", correction: "note_globale")
      const jsonMatch = thinking.match(/\{[\s\S]*?("questions"|"note_globale"|"total")[\s\S]*\}/)
      if (jsonMatch) {
        // Valider que c'est du JSON parsable
        try {
          JSON.parse(jsonMatch[0])
          console.log(`[Anthropic] 🔄 JSON extrait du bloc thinking (${jsonMatch[0].length} chars)`)
          return jsonMatch[0]
        } catch {
          // Regex trop greedy, essayer de trouver le dernier } qui parse
          const candidate = extractValidJson(thinking)
          if (candidate) {
            console.log(`[Anthropic] 🔄 JSON extrait du thinking par parsing (${candidate.length} chars)`)
            return candidate
          }
        }
      }
    }
  }

  if (textBlock) {
    return textBlock.text
  }

  // Fallback : premier bloc
  return data.content[0]?.text || data.content[0]?.thinking || ''
}

/**
 * Extrait le plus gros bloc JSON valide d'un texte (thinking block).
 * Cherche les { et essaie de parser jusqu'au } correspondant.
 */
function extractValidJson (text: string): string | null {
  const starts: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') starts.push(i)
  }

  // Trier par position décroissante pour trouver le dernier gros bloc
  for (const start of starts) {
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          if (candidate.length > 50) {
            try {
              JSON.parse(candidate)
              return candidate
            } catch {
              // Continuer
            }
          }
          break
        }
      }
    }
  }
  return null
}

// ─── Google Gemini ────────────────────────────────────────
export async function callGemini (
  model: string,
  parts: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const modelMap: Record<string, string> = {
    'gemini-3-flash': 'gemini-3-flash-preview',
    'gemini-3-pro': 'gemini-3-pro-preview',
  }

  const modelName = modelMap[model] || model

  const generationConfig: any = { temperature: 0 }

  if (options?.jsonMode) {
    generationConfig.responseMimeType = 'application/json'
  }

  // Si les parts contiennent des messages OpenAI-style (role: system/user),
  // extraire le system en systemInstruction et convertir en parts Gemini
  let systemInstruction: string | undefined
  let actualParts = parts

  if (parts.length > 0 && parts[0]?.role) {
    actualParts = []
    for (const msg of parts) {
      if (msg.role === 'system') {
        systemInstruction = msg.content
      } else if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          actualParts.push({ text: msg.content })
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              actualParts.push({ text: block.text })
            }
          }
        }
      } else if (msg.role === 'assistant') {
        // prefill — ignorer pour Gemini
      }
    }
  }

  const body: any = {
    contents: [{ parts: actualParts }],
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Gemini'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Gemini API error: ${res.status} — ${error}`)
  }

  const data = await res.json()

  if (!data.candidates?.length || !data.candidates[0].content?.parts?.length) {
    const blockReason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'inconnue'
    throw new Error(`Gemini : réponse vide (raison : ${blockReason})`)
  }

  return data.candidates[0].content.parts[0].text
}

// ─── DeepSeek ─────────────────────────────────────────────
export async function callDeepSeek (
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const body: any = {
    model: 'deepseek-chat',
    messages,
    temperature: 0,
    seed: 42,
  }

  // DeepSeek supporte response_format json_object
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetchWithRetry(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    'DeepSeek'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`DeepSeek API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Moonshot / Kimi ──────────────────────────────────────
export async function callMoonshot (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const modelMap: Record<string, string> = {
    'kimi-k2.5': 'kimi-k2.5',
    'kimi-k2-thinking': 'kimi-k2-thinking',
  }

  const isK25 = model === 'kimi-k2.5'
  const isThinking = model === 'kimi-k2-thinking'

  const body: any = {
    model: modelMap[model] || model,
    messages,
  }

  // kimi-k2.5 : temperature non modifiable, thinking activé par défaut
  if (isK25) {
    body.thinking = { type: 'enabled' }
  } else if (isThinking) {
    // kimi-k2-thinking : temperature par défaut 1.0, pas modifiable recommandé
  } else {
    body.temperature = 0
  }

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetchWithRetry(
    'https://api.moonshot.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    'Moonshot'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Moonshot API error: ${res.status} — ${error}`)
  }

  const data = await res.json()

  // Log cache automatique Moonshot si présent
  if (data.usage?.cached_tokens) {
    console.log(`[Moonshot] 💾 Cache — cached: ${data.usage.cached_tokens} tokens`)
  }

  return data.choices[0].message.content
}

// ─── xAI / Grok ──────────────────────────────────────────
// Grok 4 est un reasoning model natif — pas de temperature/presencePenalty/stop
export async function callXAI (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const body: any = {
    model: 'grok-4',
    messages,
  }

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetchWithRetry(
    'https://api.x.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    'xAI'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`xAI API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Mistral OCR ──────────────────────────────────────────
export async function callMistralOCR (
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const res = await fetchWithRetry(
    'https://api.mistral.ai/v1/ocr',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'image_url',
          image_url: `data:${mimeType};base64,${imageBase64}`,
        },
      }),
    },
    'MistralOCR'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Mistral OCR API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.pages.map((p: any) => p.markdown).join('\n\n')
}

// ─── Generic dispatcher ──────────────────────────────────
export interface ImageContent {
  base64: string
  mimeType: string
}

export function buildMessagesWithImages (
  systemPrompt: string,
  images: ImageContent[],
  modelId: string
): any[] {
  const provider = getProvider(modelId)

  if (provider === 'anthropic') {
    const imageBlocks = images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType,
        data: img.base64,
      },
    }))

    return [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: systemPrompt },
        ],
      },
    ]
  }

  if (provider === 'google') {
    // Gemini uses a different format — handled separately
    return images
      .map((img) => ({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      }))
      .concat([{ text: systemPrompt } as any])
  }

  // OpenAI-compatible (OpenAI, xAI, Moonshot)
  const imageBlocks = images.map((img) => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
    },
  }))

  return [
    {
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: systemPrompt },
      ],
    },
  ]
}

export function buildTextMessages (systemPrompt: string, userText: string): any[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ]
}

/**
 * Construit les messages pour la correction avec prompt caching.
 * - Anthropic : cache_control sur le contexte statique (énoncé + corrigé + barème)
 * - OpenAI / Google : caching automatique sur les préfixes identiques, pas de markup spécial
 *
 * @param staticContext   Contenu identique pour toutes les copies (instructions + énoncé + corrigé + barème)
 * @param variableContext Contenu spécifique à la copie (corrections précédentes + copie élève)
 * @param modelId         ID du modèle pour détecter le provider
 */
export function buildCorrectionMessages (
  staticContext: string,
  variableContext: string,
  modelId: string
): any[] {
  const provider = getProvider(modelId)

  if (provider === 'anthropic') {
    // Anthropic : séparer en blocs avec cache_control sur le contexte statique
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: staticContext,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: variableContext,
          },
        ],
      },
    ]
  }

  // Tous les autres providers : un seul message user avec tout le contenu
  // OpenAI et Google bénéficient du caching automatique de préfixe
  return [
    { role: 'user', content: `${staticContext}\n\n${variableContext}` },
  ]
}

function getProvider (modelId: string): string {
  const providerMap: Record<string, string> = {
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
    'mistral-ocr': 'mistral',
  }
  return providerMap[modelId] || 'openai'
}

export interface LLMOptions {
  jsonMode?: boolean
  /** Schéma JSON pour Anthropic structured outputs (output_config.format) */
  anthropicSchema?: Record<string, any>
}

export async function callLLM (
  modelId: string,
  messages: any[],
  env: Record<string, string | undefined>,
  options?: LLMOptions
): Promise<string> {
  const provider = getProvider(modelId)
  const t0 = performance.now()
  console.log(`[LLM] ⏳ ${modelId} (${provider}) — appel en cours...`)

  let result: string

  switch (provider) {
    case 'openai':
      result = await callOpenAI(modelId, messages, env.OPENAI_API_KEY!, options)
      break
    case 'openai-responses':
      result = await callOpenAIResponses(modelId, messages, env.OPENAI_API_KEY!, options)
      break
    case 'anthropic':
      result = await callAnthropic(modelId, messages, env.ANTHROPIC_API_KEY!, options)
      break
    case 'google':
      result = await callGemini(modelId, messages, env.GOOGLE_API_KEY!, options)
      break
    case 'deepseek':
      result = await callDeepSeek(messages, env.DEEPSEEK_API_KEY!, options)
      break
    case 'moonshot':
      result = await callMoonshot(modelId, messages, env.MOONSHOT_API_KEY!, options)
      break
    case 'xai':
      result = await callXAI(modelId, messages, env.XAI_API_KEY!, options)
      break
    default:
      throw new Error(`Provider inconnu: ${provider}`)
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  const chars = result.length
  console.log(`[LLM] ✅ ${modelId} — ${elapsed}s (${chars} chars)`)
  return result
}
