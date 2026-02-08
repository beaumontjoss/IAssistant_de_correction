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

// ─── OpenAI ───────────────────────────────────────────────
export async function callOpenAI (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const modelMap: Record<string, string> = {
    'gpt-4o-mini': 'gpt-4o-mini-2024-07-18',
    'gpt-5-nano': 'gpt-5-nano-2025-08-07',
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

// ─── Anthropic ────────────────────────────────────────────
// Opus 4.6 utilise adaptive thinking (recommandé par Anthropic, pas budget_tokens)
const ANTHROPIC_ADAPTIVE_MODELS = new Set(['claude-opus-4-6'])

export async function callAnthropic (
  model: string,
  messages: any[],
  apiKey: string
) {
  const modelMap: Record<string, string> = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
    'claude-opus-4-6': 'claude-opus-4-6',
  }

  const isAdaptive = ANTHROPIC_ADAPTIVE_MODELS.has(model)

  // Anthropic utilise un paramètre `system` de premier niveau, pas role: "system"
  let systemPrompt: string | undefined
  const filteredMessages = messages.filter((m) => {
    if (m.role === 'system') {
      systemPrompt = m.content
      return false
    }
    return true
  })

  const body: any = {
    model: modelMap[model] || model,
    messages: filteredMessages,
    max_tokens: isAdaptive ? 16000 : 8192,
  }

  if (isAdaptive) {
    // Adaptive thinking pour Opus 4.6 — Claude décide quand et combien réfléchir
    // Pas de temperature avec adaptive thinking
    // effort "low" pour minimiser la latence (correction de copies = tâche structurée)
    body.thinking = { type: 'adaptive' }
    body.output_config = { effort: 'low' }
  } else {
    body.temperature = 0
  }

  if (systemPrompt) {
    body.system = systemPrompt
  }

  console.log(`[Anthropic] model=${model}, adaptive=${isAdaptive}, max_tokens=${body.max_tokens}`)

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

  // Adaptive/thinking models peuvent renvoyer [{type:"thinking",...}, {type:"text",...}]
  // ou juste [{type:"text",...}] si Claude décide de ne pas réfléchir
  const textBlock = data.content.find((b: any) => b.type === 'text')
  if (textBlock) {
    return textBlock.text
  }

  // Fallback : premier bloc
  return data.content[0].text
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
  apiKey: string
) {
  const modelMap: Record<string, string> = {
    'kimi-k2.5': 'kimi-k2.5',
    'kimi-k2-thinking': 'kimi-k2-thinking',
  }

  const res = await fetchWithRetry(
    'https://api.moonshot.cn/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelMap[model] || model,
        messages,
        temperature: 0,
      }),
    },
    'Moonshot'
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Moonshot API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
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

function getProvider (modelId: string): string {
  const providerMap: Record<string, string> = {
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
    'mistral-ocr': 'mistral',
  }
  return providerMap[modelId] || 'openai'
}

export interface LLMOptions {
  jsonMode?: boolean
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
    case 'anthropic':
      result = await callAnthropic(modelId, messages, env.ANTHROPIC_API_KEY!)
      break
    case 'google':
      result = await callGemini(modelId, messages, env.GOOGLE_API_KEY!, options)
      break
    case 'deepseek':
      result = await callDeepSeek(messages, env.DEEPSEEK_API_KEY!, options)
      break
    case 'moonshot':
      result = await callMoonshot(modelId, messages, env.MOONSHOT_API_KEY!)
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
