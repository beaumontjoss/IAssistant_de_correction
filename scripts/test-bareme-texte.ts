#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Test barème en mode TEXTE — transcription Gemini + test sur tous les LLM
 *
 * 1. Transcrit les images énoncé (1-4) via Gemini → énoncés/enonce.md
 * 2. Transcrit les images corrigé (1-3) via Gemini → énoncés/corrige.md
 * 3. Lance la génération de barème sur TOUS les LLM avec le texte transcrit
 *
 * Usage :
 *   bun run scripts/test-bareme-texte.ts
 *   bun run scripts/test-bareme-texte.ts --skip-transcription   # réutiliser les .md existants
 *   bun run scripts/test-bareme-texte.ts --model claude-opus-4-6
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { robustJsonParse, normalizeBareme } from '../lib/json-utils'
import { getBaremePrompt } from '../lib/prompts'

// ─── Config ─────────────────────────────────────────────

const SKIP_TRANSCRIPTION = process.argv.includes('--skip-transcription')
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

const IMG_DIR = join(process.cwd(), 'énoncés')
const ENONCE_MD = join(IMG_DIR, 'enonce.md')
const CORRIGE_MD = join(IMG_DIR, 'corrige.md')

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

// ─── Step 1 & 2 : Transcription via Gemini ──────────────

const TRANSCRIPTION_PROMPT = `Tu es un assistant pédagogique qui aide un enseignant à numériser ses documents de cours.
L'enseignant te fournit des photos d'un document scolaire (contrôle, exercice, ou corrigé) qu'il a lui-même rédigé.
Ton rôle est de produire une version texte structurée de ce document pour qu'il puisse l'utiliser dans son outil de correction.

Instructions :
- Restitue le contenu complet du document en Markdown.
- Conserve la structure originale (titres, numérotation, sous-parties, consignes).
- Sois fidèle au contenu : n'invente rien, ne résume pas.
- Si un passage est difficile à lire, fais de ton mieux et signale les incertitudes avec [illisible].

Pour les éléments visuels (graphiques, schémas, figures, cartes, diagrammes) :
- Décris-les en détail entre balises [FIGURE: ...]

Pour les tableaux, utilise la syntaxe Markdown de tableau.
Pour les formules mathématiques, utilise la notation LaTeX entre $ ou $$.`

function loadImages (filenames: string[]): Array<{ base64: string; mimeType: string }> {
  const images: Array<{ base64: string; mimeType: string }> = []
  for (const f of filenames) {
    const path = join(IMG_DIR, f)
    if (!existsSync(path)) continue
    const buf = readFileSync(path)
    images.push({ base64: buf.toString('base64'), mimeType: 'image/jpeg' })
  }
  return images
}

async function fetchWithTimeout (url: string, body: any, headers: Record<string, string>, label: string, timeoutMs = 120000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`${label} ${res.status}: ${err.slice(0, 500)}`)
    }
    return res.json()
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`${label} timeout après ${timeoutMs / 1000}s`)
    throw err
  }
}

async function transcribeWithGeminiModel (
  images: Array<{ base64: string; mimeType: string }>,
  label: string,
  geminiModel: string
): Promise<string> {
  const parts = images.map((img) => ({
    inline_data: { mime_type: img.mimeType, data: img.base64 },
  })).concat([{ text: TRANSCRIPTION_PROMPT } as any])

  const data = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${ENV.GOOGLE_API_KEY}`,
    {
      contents: [{ parts }],
      generationConfig: { temperature: 0 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    },
    {},
    `Gemini-Transcription/${label}`,
    90000 // 90s timeout
  )

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || text.length < 50) {
    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || '?'
    throw new Error(`Gemini réponse vide pour ${label} (raison: ${reason})`)
  }

  return text
}

async function transcribeWithMistralOCR (
  images: Array<{ base64: string; mimeType: string }>,
  label: string
): Promise<string> {
  const pages: string[] = []
  for (let i = 0; i < images.length; i++) {
    console.log(`     Mistral OCR — page ${i + 1}/${images.length}`)
    const data = await fetchApi(
      'https://api.mistral.ai/v1/ocr',
      {
        model: 'mistral-ocr-latest',
        document: {
          type: 'image_url',
          image_url: `data:${images[i].mimeType};base64,${images[i].base64}`,
        },
      },
      { Authorization: `Bearer ${ENV.MISTRAL_API_KEY}` },
      `MistralOCR/${label}/page${i + 1}`
    )
    const pageText = data.pages?.map((p: any) => p.markdown).join('\n\n') ?? ''
    pages.push(pageText)
  }
  return pages.join('\n\n---\n\n')
}

async function transcribeImages (
  images: Array<{ base64: string; mimeType: string }>,
  label: string
): Promise<string> {
  console.log(`\n  📸 Transcription ${label} — ${images.length} images`)
  const t0 = performance.now()

  // Pipeline : Gemini Flash → Gemini Pro → Mistral OCR
  const pipeline = [
    { name: 'Gemini 3 Flash', fn: () => transcribeWithGeminiModel(images, label, 'gemini-3-flash-preview') },
    { name: 'Gemini 3 Pro', fn: () => transcribeWithGeminiModel(images, label, 'gemini-3-pro-preview') },
    { name: 'Mistral OCR', fn: () => transcribeWithMistralOCR(images, label) },
  ]

  for (const model of pipeline) {
    try {
      console.log(`     Essai ${model.name}...`)
      const text = await model.fn()
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
      console.log(`  ✅ ${label} transcrit via ${model.name} — ${text.length} chars en ${elapsed}s`)
      return text
    } catch (err: any) {
      const isRecitation = err.message?.includes('RECITATION')
      console.log(`  ⚠️ ${model.name} échoué${isRecitation ? ' (RECITATION)' : ''}: ${err.message?.slice(0, 80)}`)
    }
  }

  throw new Error(`Tous les modèles de transcription ont échoué pour ${label}`)
}

// ─── Step 3 : Test barème texte ─────────────────────────

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

// ── Anthropic ───

async function testAnthropic (
  model: string,
  apiModel: string,
  prompt: string,
  isAdaptive: boolean
): Promise<{ raw: string; thinkingInfo: string }> {
  const body: any = {
    model: apiModel,
    max_tokens: isAdaptive ? 64000 : 8192,
    messages: [{ role: 'user', content: prompt }],
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

  const allTextBlocks = data.content?.filter((b: any) => b.type === 'text') ?? []
  const textBlock = allTextBlocks.length > 1
    ? allTextBlocks.reduce((best: any, b: any) => (b.text?.length ?? 0) > (best.text?.length ?? 0) ? b : best)
    : allTextBlocks[0]
  const thinkingBlocks = data.content?.filter((b: any) => b.type === 'thinking') ?? []

  const textContent = textBlock?.text ?? ''
  const thinkingContent = thinkingBlocks.map((b: any) => b.thinking ?? '').join('\n')
  const usage = data.usage ?? {}

  const thinkingInfo = [
    `stop=${data.stop_reason}`,
    `text=${textContent.length}ch`,
    `thinking=${thinkingContent.length}ch`,
    `input=${usage.input_tokens ?? '?'}`,
    `output=${usage.output_tokens ?? '?'}`,
  ].filter(Boolean).join(', ')

  if (textContent.length > 10) {
    return { raw: textContent, thinkingInfo }
  }

  // Fallback thinking
  if (isAdaptive && thinkingContent.length > 20) {
    const jsonMatch = thinkingContent.match(
      /\{[\s\S]*?("questions"|"sections"|"exercices"|"items"|"bareme"|"barème"|"note_globale"|"total"|"total_points"|"total_général"|"criteres"|"critères"|"resultats"|"résultats"|"corrections")[\s\S]*\}/
    )
    if (jsonMatch) {
      try { JSON.parse(jsonMatch[0]); return { raw: jsonMatch[0], thinkingInfo: thinkingInfo + ' [thinking-regex]' } } catch {}
    }
    const candidate = extractValidJson(thinkingContent)
    if (candidate) return { raw: candidate, thinkingInfo: thinkingInfo + ' [thinking-parse]' }
  }

  return { raw: textContent, thinkingInfo }
}

// ── OpenAI ───

async function testOpenAI (model: string, apiModel: string, prompt: string): Promise<string> {
  const body: any = {
    model: apiModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    seed: 42,
    response_format: { type: 'json_object' },
  }

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

// ── Gemini ───

async function testGemini (model: string, apiModel: string, prompt: string): Promise<string> {
  const data = await fetchApi(
    `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${ENV.GOOGLE_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
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

// ── Mistral ───

async function testMistral (prompt: string): Promise<string> {
  const data = await fetchApi(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: 'mistral-large-2512',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    },
    { Authorization: `Bearer ${ENV.MISTRAL_API_KEY}` },
    'Mistral/mistral-large'
  )
  return data.choices[0].message.content
}

// ── DeepSeek ───

async function testDeepSeek (prompt: string): Promise<string> {
  const data = await fetchApi(
    'https://api.deepseek.com/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
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

// ─── Save detailed log ──────────────────────────────────

function saveLog (model: string, data: any) {
  const dir = join(process.cwd(), 'logs_appels_llm')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
  const path = join(dir, `${ts}_test-bareme-texte_${model}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`  💾 Log: ${path}`)
}

async function runTest (m: ModelConfig, prompt: string) {
  const keyValue = ENV[m.apiKey as keyof typeof ENV]
  if (!keyValue) {
    console.log(`  ⏭️  ${m.id} — API key manquante`)
    return
  }

  process.stdout.write(`  ⏳ ${m.id}...`)
  const t0 = performance.now()

  try {
    let raw: string
    let thinkingInfo = ''

    switch (m.provider) {
      case 'anthropic': {
        const result = await testAnthropic(m.id, m.apiModel, prompt, m.isAdaptive ?? false)
        raw = result.raw
        thinkingInfo = result.thinkingInfo
        break
      }
      case 'google':
        raw = await testGemini(m.id, m.apiModel, prompt)
        break
      case 'openai':
        raw = await testOpenAI(m.id, m.apiModel, prompt)
        break
      case 'mistral':
        raw = await testMistral(prompt)
        break
      case 'deepseek':
        raw = await testDeepSeek(prompt)
        break
      default:
        throw new Error(`Provider inconnu: ${m.provider}`)
    }

    const elapsed = performance.now() - t0

    // Save raw log
    saveLog(m.id, {
      model: m.id,
      mode: 'texte',
      raw_length: raw.length,
      raw_preview: raw.slice(0, 2000),
      thinkingInfo,
    })

    // Parse and normalize
    const parsed = robustJsonParse(raw)
    const bareme = normalizeBareme(parsed)

    const isOk = bareme.questions.length >= 3 && bareme.total > 0
      && bareme.questions[0].titre !== 'Item 1 — À compléter'

    // Affichage détaillé
    console.log(`\n  📊 ${m.id} — ${bareme.questions.length} questions, ${bareme.total} pts`)
    for (const q of bareme.questions.slice(0, 5)) {
      console.log(`     ${q.id}. ${q.titre} (${q.points} pts, ${q.criteres.length} critères)`)
    }
    if (bareme.questions.length > 5) console.log(`     ... +${bareme.questions.length - 5} de plus`)

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
  console.log('  RÉSULTATS — TEST BARÈME MODE TEXTE (pas d\'images)')
  console.log('  Attendu : 12 questions, 50 points')
  console.log('═'.repeat(120))

  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌'
    const time = `${(r.time / 1000).toFixed(1).padStart(6)}s`
    const model = r.model.padEnd(22)
    const qs = `${String(r.questions).padStart(3)}q`
    const pts = `${String(r.total).padStart(5)}pts`
    const raw = `${String(r.rawLength).padStart(6)}ch`

    const q12 = r.questions === 12 ? '✓12q' : `✗${r.questions}q`
    const p50 = r.total === 50 ? '✓50pts' : `✗${r.total}pts`

    console.log(`  ${icon} ${model} ${time}  ${qs}  ${pts}  ${raw}  [${q12} ${p50}]  ${r.detail.slice(0, 50)}`)
    if (r.thinkingInfo) {
      console.log(`     └─ ${r.thinkingInfo}`)
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length
  const ko = results.filter((r) => r.status === 'ko').length

  console.log(`\n  ${ok}/${results.length} OK  |  ${ko} KO`)

  // Tableau de conformité 12q/50pts
  console.log('\n  📋 CONFORMITÉ 12 questions / 50 points :')
  for (const r of results) {
    const q = r.questions === 12 ? '✅' : '❌'
    const p = r.total === 50 ? '✅' : '❌'
    console.log(`     ${r.model.padEnd(22)} questions: ${q} (${r.questions})   points: ${p} (${r.total})`)
  }

  if (ko > 0) {
    console.log('\n  ❌ ERREURS :')
    for (const r of results.filter((r) => r.status === 'ko')) {
      console.log(`     ${r.model} — ${r.detail}`)
    }
  }
  console.log('═'.repeat(120) + '\n')
}

// ─── Main ───────────────────────────────────────────────

async function main () {
  console.log('\n🧪 Test barème — mode TEXTE (transcription Gemini puis test tous LLM)')
  console.log(`   ${MODEL_FILTER ? `Modèle: ${MODEL_FILTER}` : 'Tous les modèles'}`)
  console.log(`   Skip transcription: ${SKIP_TRANSCRIPTION}\n`)

  let enonceText: string
  let corrigeText: string

  // ── Étape 1 & 2 : Transcription ──

  if (SKIP_TRANSCRIPTION && existsSync(ENONCE_MD) && existsSync(CORRIGE_MD)) {
    console.log('📂 Réutilisation des transcriptions existantes')
    enonceText = readFileSync(ENONCE_MD, 'utf-8')
    corrigeText = readFileSync(CORRIGE_MD, 'utf-8')
    console.log(`   enonce.md : ${enonceText.length} chars`)
    console.log(`   corrige.md : ${corrigeText.length} chars`)
  } else {
    console.log('📝 Étape 1/3 — Transcription des images via Gemini')

    const enonceImages = loadImages(['énoncé1.jpeg', 'énoncé2.jpeg', 'énoncé3.jpeg', 'énoncé4.jpeg'])
    const corrigeImages = loadImages(['corrigé1.jpeg', 'corrigé2.jpeg', 'corrigé3.jpeg'])

    if (enonceImages.length === 0) {
      console.error('❌ Aucune image d\'énoncé trouvée dans énoncés/')
      process.exit(1)
    }

    // Transcription séquentielle (éviter les conflits de rate limit Gemini)
    const enonceResult = await transcribeImages(enonceImages, 'énoncé')
    const corrigeResult = corrigeImages.length > 0
      ? await transcribeImages(corrigeImages, 'corrigé')
      : ''

    enonceText = enonceResult
    corrigeText = corrigeResult

    // Sauvegarder les .md
    writeFileSync(ENONCE_MD, enonceText)
    console.log(`\n  💾 Sauvegardé : ${ENONCE_MD} (${enonceText.length} chars)`)

    if (corrigeText) {
      writeFileSync(CORRIGE_MD, corrigeText)
      console.log(`  💾 Sauvegardé : ${CORRIGE_MD} (${corrigeText.length} chars)`)
    }
  }

  // ── Étape 3 : Génération de barème avec texte ──

  console.log('\n📝 Étape 2/3 — Génération de barème sur tous les LLM (mode texte)')

  const prompt = getBaremePrompt(
    'Francais',
    '3ème',
    enonceText,
    corrigeText || undefined
  )

  console.log(`📝 Prompt: ${prompt.length} chars (corrigé: ${corrigeText ? 'oui' : 'non'})\n`)

  const modelsToTest = MODEL_FILTER
    ? MODELS.filter((m) => m.id === MODEL_FILTER)
    : MODELS

  for (const m of modelsToTest) {
    await runTest(m, prompt)
  }

  // ── Étape 3 : Résultats ──

  console.log('\n📝 Étape 3/3 — Résultats')
  printResults()
  process.exit(results.some((r) => r.status === 'ko') ? 1 : 0)
}

main()
