#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Test de génération de barème — appels directs aux APIs avec images réelles
 *
 * Usage :
 *   bun run scripts/test-bareme.ts                      # tous les modèles multimodaux
 *   bun run scripts/test-bareme.ts --model claude-opus-4-6  # un modèle spécifique
 *   bun run scripts/test-bareme.ts --verbose             # réponses brutes détaillées
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { robustJsonParse, normalizeBareme } from '../lib/json-utils'
import { getBaremePrompt } from '../lib/prompts'

// ─── Config ─────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose')
const MODEL_FILTER = getArgValue('--model')

function getArgValue (flag: string): string | null {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null
}

const ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || '',
  XAI_API_KEY: process.env.XAI_API_KEY || '',
}

// ─── Types ──────────────────────────────────────────────

interface TestResult {
  model: string
  status: 'ok' | 'ko'
  time: number
  questions: number
  total: number
  detail: string
  rawLength: number
  thinkingInfo?: string
}

const results: TestResult[] = []

// ─── Load test images ───────────────────────────────────

interface TestImages {
  enonce: Array<{ base64: string; mimeType: string }>
  corrige: Array<{ base64: string; mimeType: string }>
  all: Array<{ base64: string; mimeType: string }>
}

function loadTestImages (): TestImages {
  const imgDir = join(process.cwd(), 'énoncés')

  const loadFiles = (pattern: string[]): Array<{ base64: string; mimeType: string }> => {
    const images: Array<{ base64: string; mimeType: string }> = []
    for (const f of pattern) {
      const path = join(imgDir, f)
      if (!existsSync(path)) continue
      const buf = readFileSync(path)
      images.push({ base64: buf.toString('base64'), mimeType: 'image/jpeg' })
    }
    return images
  }

  const enonce = loadFiles(['énoncé1.jpeg', 'énoncé2.jpeg', 'énoncé3.jpeg', 'énoncé4.jpeg'])
  const corrige = loadFiles(['corrigé1.jpeg', 'corrigé2.jpeg', 'corrigé3.jpeg'])
  const all = [...enonce, ...corrige]

  const totalKb = (all.reduce((s, i) => s + i.base64.length, 0) / 1024).toFixed(0)
  console.log(`📸 ${enonce.length} images énoncé + ${corrige.length} images corrigé (${totalKb} KB base64 total)`)
  return { enonce, corrige, all }
}

// ─── Save detailed log ──────────────────────────────────

function saveLog (model: string, data: any) {
  const dir = join(process.cwd(), 'logs_appels_llm')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
  const path = join(dir, `${ts}_test-bareme_${model}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`  💾 Log: ${path}`)
}

// ─── Fetch helper ───────────────────────────────────────

async function fetchApi (url: string, body: any, headers: Record<string, string>, label: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${label} ${res.status}: ${err.slice(0, 500)}`)
  }
  return res.json()
}

// ─── Build prompt ───────────────────────────────────────

function buildBaremePrompt (hasCorrige: boolean): string {
  return getBaremePrompt(
    'Francais',
    '3ème',
    '[Voir images de l\'énoncé ci-jointes]',
    hasCorrige ? '[Voir images du corrigé ci-jointes]' : undefined
  )
}

// ─── Model-specific callers ─────────────────────────────

async function testAnthropicBareme (
  model: string,
  apiModel: string,
  images: Array<{ base64: string; mimeType: string }>,
  prompt: string,
  isAdaptive: boolean
): Promise<{ raw: string; thinkingInfo: string }> {
  const imageBlocks = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
  }))

  const body: any = {
    model: apiModel,
    max_tokens: isAdaptive ? 64000 : 8192,
    messages: [{
      role: 'user',
      content: [...imageBlocks, { type: 'text', text: prompt }],
    }],
  }

  if (isAdaptive) {
    body.thinking = { type: 'adaptive' }
  } else {
    body.temperature = 0
  }

  const data = await fetchApi(
    'https://api.anthropic.com/v1/messages',
    body,
    { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    `Anthropic/${model}`
  )

  // Detailed logging — prendre le bloc text le plus long (pas le pré-texte vide)
  const allTextBlocks = data.content?.filter((b: any) => b.type === 'text') ?? []
  const textBlock = allTextBlocks.length > 1
    ? allTextBlocks.reduce((best: any, b: any) => (b.text?.length ?? 0) > (best.text?.length ?? 0) ? b : best)
    : allTextBlocks[0]
  const thinkingBlocks = data.content?.filter((b: any) => b.type === 'thinking') ?? []
  const redactedBlocks = data.content?.filter((b: any) => b.type === 'redacted_thinking') ?? []

  const textContent = textBlock?.text ?? ''
  const thinkingContent = thinkingBlocks.map((b: any) => b.thinking ?? '').join('\n')
  const usage = data.usage ?? {}

  const thinkingInfo = [
    `stop=${data.stop_reason}`,
    `text=${textContent.length}ch`,
    `thinking=${thinkingContent.length}ch (${thinkingBlocks.length} blocks)`,
    redactedBlocks.length > 0 ? `redacted=${redactedBlocks.length}` : '',
    `input=${usage.input_tokens ?? '?'}`,
    `output=${usage.output_tokens ?? '?'}`,
    usage.cache_read_input_tokens ? `cache_read=${usage.cache_read_input_tokens}` : '',
  ].filter(Boolean).join(', ')

  if (VERBOSE) {
    console.log(`\n  📋 Anthropic/${model} response:`)
    console.log(`     stop_reason: ${data.stop_reason}`)
    console.log(`     content blocks: ${data.content?.length}`)
    for (const b of data.content ?? []) {
      if (b.type === 'thinking') {
        console.log(`     [thinking] ${b.thinking?.length ?? 0} chars: "${(b.thinking ?? '').slice(0, 200)}..."`)
      } else if (b.type === 'text') {
        console.log(`     [text] ${b.text?.length ?? 0} chars: "${b.text?.slice(0, 200)}..."`)
      } else if (b.type === 'redacted_thinking') {
        console.log(`     [redacted_thinking] ${b.data?.length ?? 0} chars`)
      }
    }
    console.log(`     usage: ${JSON.stringify(usage)}`)
  }

  // Save full response for analysis
  saveLog(model, {
    model, apiModel,
    response_blocks: data.content?.map((b: any) => ({
      type: b.type,
      length: (b.text ?? b.thinking ?? b.data ?? '').length,
      preview: (b.text ?? b.thinking ?? '').slice(0, 500),
    })),
    stop_reason: data.stop_reason,
    usage,
    text_raw: textContent,
    thinking_raw: thinkingContent.slice(0, 5000),
  })

  // Try to extract JSON: text block first, then thinking block
  if (textContent.length > 10) {
    return { raw: textContent, thinkingInfo }
  }

  // Fallback: extract from thinking blocks
  if (isAdaptive && thinkingContent.length > 20) {
    // 1) Regex match
    const jsonMatch = thinkingContent.match(
      /\{[\s\S]*?("questions"|"sections"|"exercices"|"items"|"bareme"|"barème"|"note_globale"|"total"|"total_points"|"total_général"|"criteres"|"critères"|"resultats"|"résultats"|"corrections")[\s\S]*\}/
    )
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[0])
        console.log(`  🔄 JSON extrait du thinking via regex (${jsonMatch[0].length} chars)`)
        return { raw: jsonMatch[0], thinkingInfo: thinkingInfo + ' [from-thinking-regex]' }
      } catch {
        // Continue to structural parsing
      }
    }

    // 2) Structural parsing
    const candidate = extractValidJson(thinkingContent)
    if (candidate) {
      console.log(`  🔄 JSON extrait du thinking par parsing (${candidate.length} chars)`)
      return { raw: candidate, thinkingInfo: thinkingInfo + ' [from-thinking-parse]' }
    }
  }

  return { raw: textContent, thinkingInfo }
}

function extractValidJson (text: string): string | null {
  const starts: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') starts.push(i)
  }
  for (const start of starts) {
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          if (candidate.length > 50) {
            try { JSON.parse(candidate); return candidate } catch {}
          }
          break
        }
      }
    }
  }
  return null
}

async function testGeminiBareme (
  model: string,
  apiModel: string,
  images: Array<{ base64: string; mimeType: string }>,
  prompt: string
): Promise<string> {
  const parts = images.map((img) => ({
    inline_data: { mime_type: img.mimeType, data: img.base64 },
  })).concat([{ text: prompt } as any])

  const data = await fetchApi(
    `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${ENV.GOOGLE_API_KEY}`,
    {
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    },
    {},
    `Gemini/${model}`
  )

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(`Gemini réponse vide (${data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '?'})`)
  }
  return data.candidates[0].content.parts[0].text
}

async function testOpenAIBareme (
  model: string,
  apiModel: string,
  images: Array<{ base64: string; mimeType: string }>,
  prompt: string
): Promise<string> {
  const imageBlocks = images.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }))

  const body: any = {
    model: apiModel,
    messages: [{
      role: 'user',
      content: [...imageBlocks, { type: 'text', text: prompt }],
    }],
    temperature: 0,
    seed: 42,
    response_format: { type: 'json_object' },
  }

  // GPT-5 Nano ne supporte pas temperature != 1
  if (model === 'gpt-5-nano') {
    delete body.temperature
    delete body.seed
  }

  const data = await fetchApi(
    'https://api.openai.com/v1/chat/completions',
    body,
    { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` },
    `OpenAI/${model}`
  )
  return data.choices[0].message.content
}

async function testMistralBareme (
  model: string,
  images: Array<{ base64: string; mimeType: string }>,
  prompt: string
): Promise<string> {
  const imageBlocks = images.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }))

  const data = await fetchApi(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: 'mistral-large-2512',
      messages: [{
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: prompt }],
      }],
      temperature: 0,
      response_format: { type: 'json_object' },
    },
    { Authorization: `Bearer ${ENV.MISTRAL_API_KEY}` },
    'Mistral/mistral-large'
  )
  return data.choices[0].message.content
}

async function testDeepSeekBareme (prompt: string): Promise<string> {
  // Text-only : on inclut une note dans le prompt
  const textPrompt = prompt.replace(
    '[Voir images de l\'énoncé ci-jointes]',
    '(Pas d\'images disponibles — génère un barème générique pour un contrôle de Français 3ème type Brevet: grammaire, compréhension de texte, rédaction, dictée)'
  )

  const data = await fetchApi(
    'https://api.deepseek.com/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: textPrompt }],
      temperature: 0,
      seed: 42,
      response_format: { type: 'json_object' },
    },
    { Authorization: `Bearer ${ENV.DEEPSEEK_API_KEY}` },
    'DeepSeek'
  )
  return data.choices[0].message.content
}

// ─── Main test runner ───────────────────────────────────

interface ModelConfig {
  id: string
  provider: string
  apiModel: string
  apiKey: string
  isAdaptive?: boolean
}

const MODELS: ModelConfig[] = [
  { id: 'claude-opus-4-6', provider: 'anthropic', apiModel: 'claude-opus-4-6', apiKey: 'ANTHROPIC_API_KEY', isAdaptive: true },
  { id: 'claude-haiku-4-5', provider: 'anthropic', apiModel: 'claude-haiku-4-5-20251001', apiKey: 'ANTHROPIC_API_KEY' },
  { id: 'gemini-3-flash', provider: 'google', apiModel: 'gemini-3-flash-preview', apiKey: 'GOOGLE_API_KEY' },
  { id: 'gemini-3-pro', provider: 'google', apiModel: 'gemini-3-pro-preview', apiKey: 'GOOGLE_API_KEY' },
  { id: 'gpt-4o-mini', provider: 'openai', apiModel: 'gpt-4o-mini-2024-07-18', apiKey: 'OPENAI_API_KEY' },
  { id: 'gpt-5.2', provider: 'openai', apiModel: 'gpt-5.2-2025-12-11', apiKey: 'OPENAI_API_KEY' },
  { id: 'mistral-large', provider: 'mistral', apiModel: 'mistral-large-2512', apiKey: 'MISTRAL_API_KEY' },
  { id: 'deepseek-v3.2', provider: 'deepseek', apiModel: 'deepseek-chat', apiKey: 'DEEPSEEK_API_KEY' },
]

async function runTest (m: ModelConfig, testImages: TestImages, prompt: string) {
  const keyValue = ENV[m.apiKey as keyof typeof ENV]
  if (!keyValue) {
    console.log(`  ⏭️  ${m.id} — API key manquante`)
    return
  }

  process.stdout.write(`  ⏳ ${m.id}...`)
  const t0 = performance.now()

  // Les modèles multimodaux reçoivent toutes les images (énoncé + corrigé)
  const images = testImages.all

  try {
    let raw: string
    let thinkingInfo = ''

    switch (m.provider) {
      case 'anthropic': {
        const result = await testAnthropicBareme(m.id, m.apiModel, images, prompt, m.isAdaptive ?? false)
        raw = result.raw
        thinkingInfo = result.thinkingInfo
        break
      }
      case 'google':
        raw = await testGeminiBareme(m.id, m.apiModel, images, prompt)
        break
      case 'openai':
        raw = await testOpenAIBareme(m.id, m.apiModel, images, prompt)
        break
      case 'mistral':
        raw = await testMistralBareme(m.id, images, prompt)
        break
      case 'deepseek':
        raw = await testDeepSeekBareme(prompt)
        break
      default:
        throw new Error(`Provider inconnu: ${m.provider}`)
    }

    const elapsed = performance.now() - t0

    // Parse and normalize
    const parsed = robustJsonParse(raw)
    const bareme = normalizeBareme(parsed)

    const isOk = bareme.questions.length >= 3 && bareme.total > 0
      && bareme.questions[0].titre !== 'Item 1 — À compléter'

    if (VERBOSE) {
      console.log(`\n  📊 ${m.id} — ${bareme.questions.length} questions, ${bareme.total} pts`)
      for (const q of bareme.questions.slice(0, 5)) {
        console.log(`     ${q.id}. ${q.titre} (${q.points} pts, ${q.criteres.length} critères)`)
      }
      if (bareme.questions.length > 5) console.log(`     ... +${bareme.questions.length - 5} de plus`)
    }

    console.log(` ${isOk ? '✅' : '❌'} ${(elapsed / 1000).toFixed(1)}s — ${bareme.questions.length} questions, ${bareme.total} pts`)

    results.push({
      model: m.id,
      status: isOk ? 'ok' : 'ko',
      time: elapsed,
      questions: bareme.questions.length,
      total: bareme.total,
      rawLength: raw.length,
      detail: isOk
        ? `${bareme.questions.length}q, ${bareme.total}pts — "${bareme.questions[0]?.titre?.slice(0, 40)}..."`
        : `ÉCHEC — ${bareme.questions.length}q, ${bareme.total}pts, raw=${raw.length}ch`,
      thinkingInfo,
    })
  } catch (err: any) {
    const elapsed = performance.now() - t0
    console.log(` ❌ ${(elapsed / 1000).toFixed(1)}s — ${err.message.slice(0, 100)}`)
    results.push({
      model: m.id,
      status: 'ko',
      time: elapsed,
      questions: 0,
      total: 0,
      rawLength: 0,
      detail: err.message.slice(0, 120),
    })
  }
}

function printResults () {
  console.log('\n' + '═'.repeat(120))
  console.log('  RÉSULTATS — TEST BARÈME AVEC IMAGES RÉELLES')
  console.log('═'.repeat(120))

  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌'
    const time = `${(r.time / 1000).toFixed(1).padStart(6)}s`
    const model = r.model.padEnd(22)
    const qs = `${String(r.questions).padStart(3)}q`
    const pts = `${String(r.total).padStart(4)}pts`
    const raw = `${String(r.rawLength).padStart(6)}ch`
    console.log(`  ${icon} ${model} ${time}  ${qs}  ${pts}  ${raw}  ${r.detail.slice(0, 55)}`)
    if (r.thinkingInfo) {
      console.log(`     └─ ${r.thinkingInfo}`)
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length
  const ko = results.filter((r) => r.status === 'ko').length

  console.log(`\n  ${ok}/${results.length} OK  |  ${ko} KO`)

  if (ko > 0) {
    console.log('\n  ❌ ERREURS :')
    for (const r of results.filter((r) => r.status === 'ko')) {
      console.log(`     ${r.model} — ${r.detail}`)
    }
  }
  console.log('═'.repeat(120) + '\n')
}

async function main () {
  console.log('\n🧪 Test barème — génération avec images réelles')
  console.log(`   ${MODEL_FILTER ? `Modèle: ${MODEL_FILTER}` : 'Tous les modèles multimodaux'}`)
  console.log(`   Verbose: ${VERBOSE}\n`)

  const testImages = loadTestImages()
  if (testImages.enonce.length === 0) {
    console.error('❌ Aucune image d\'énoncé trouvée dans énoncés/')
    process.exit(1)
  }

  const hasCorrige = testImages.corrige.length > 0
  const prompt = buildBaremePrompt(hasCorrige)
  console.log(`📝 Prompt: ${prompt.length} chars (corrigé: ${hasCorrige ? 'oui' : 'non'})\n`)

  const modelsToTest = MODEL_FILTER
    ? MODELS.filter((m) => m.id === MODEL_FILTER)
    : MODELS

  for (const m of modelsToTest) {
    await runTest(m, testImages, prompt)
  }

  printResults()
  process.exit(results.some((r) => r.status === 'ko') ? 1 : 0)
}

main()
