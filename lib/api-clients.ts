/* eslint-disable @typescript-eslint/no-explicit-any */

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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAI API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Anthropic ────────────────────────────────────────────
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelMap[model] || model,
      messages,
      temperature: 0,
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Anthropic API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
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

  // JSON mode pour Gemini : responseMimeType
  if (options?.jsonMode) {
    generationConfig.responseMimeType = 'application/json'
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    }
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
  apiKey: string
) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0,
      seed: 42,
    }),
  })

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

  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
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
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Moonshot API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ─── xAI / Grok ──────────────────────────────────────────
export async function callXAI (
  model: string,
  messages: any[],
  apiKey: string,
  options?: { jsonMode?: boolean }
) {
  const body: any = {
    model: 'grok-4-1-fast',
    messages,
    temperature: 0,
  }

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  if (model === 'grok-4-1-fast-reasoning') {
    body.reasoning = true
  }

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

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
  const res = await fetch('https://api.mistral.ai/v1/ocr', {
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
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Mistral OCR API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.pages.map((p: any) => p.markdown).join('\n\n')
}

// ─── Google Cloud Vision ──────────────────────────────────
export async function callGoogleVision (
  imageBase64: string,
  apiKey: string
): Promise<string> {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['fr'] },
          },
        ],
      }),
    }
  )

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google Vision API error: ${res.status} — ${error}`)
  }

  const data = await res.json()
  return data.responses[0]?.textAnnotations?.[0]?.description || ''
}

// ─── Azure Document Intelligence ──────────────────────────
export async function callAzureDI (
  imageBase64: string,
  endpoint: string,
  apiKey: string
): Promise<string> {
  const analyzeRes = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      body: JSON.stringify({ base64Source: imageBase64 }),
    }
  )

  if (!analyzeRes.ok) {
    const error = await analyzeRes.text()
    throw new Error(`Azure DI API error: ${analyzeRes.status} — ${error}`)
  }

  const operationLocation = analyzeRes.headers.get('Operation-Location')
  if (!operationLocation) {
    throw new Error('Azure DI: Operation-Location header missing')
  }

  // Polling for result
  const maxAttempts = 15
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000))

    const pollRes = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    })

    if (!pollRes.ok) {
      const error = await pollRes.text()
      throw new Error(`Azure DI polling error: ${pollRes.status} — ${error}`)
    }

    const pollData = await pollRes.json()

    if (pollData.status === 'succeeded') {
      return pollData.analyzeResult?.content || ''
    }

    if (pollData.status === 'failed') {
      throw new Error('Azure DI analysis failed')
    }
  }

  throw new Error('Azure DI: timeout after 30 seconds')
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
    'grok-4-1-fast': 'xai',
    'grok-4-1-fast-reasoning': 'xai',
    'mistral-ocr': 'mistral',
    'google-vision': 'google-vision',
    'azure-di': 'azure',
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

  switch (provider) {
    case 'openai':
      return callOpenAI(modelId, messages, env.OPENAI_API_KEY!, options)
    case 'anthropic':
      return callAnthropic(modelId, messages, env.ANTHROPIC_API_KEY!)
    case 'google':
      return callGemini(modelId, messages, env.GOOGLE_API_KEY!, options)
    case 'deepseek':
      return callDeepSeek(messages, env.DEEPSEEK_API_KEY!)
    case 'moonshot':
      return callMoonshot(modelId, messages, env.MOONSHOT_API_KEY!)
    case 'xai':
      return callXAI(modelId, messages, env.XAI_API_KEY!, options)
    default:
      throw new Error(`Provider inconnu: ${provider}`)
  }
}
