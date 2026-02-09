#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Batterie de tests LLM — exécutable via CLI
 *
 * Usage :
 *   bun run scripts/test-llm.ts                    # tous les tests
 *   bun run scripts/test-llm.ts --test connectivity # un test spécifique
 *   bun run scripts/test-llm.ts --model gpt-5.2    # un modèle spécifique
 *   bun run scripts/test-llm.ts --verbose           # affiche les réponses brutes
 */

// ─── Config ─────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose')
const TEST_FILTER = getArgValue('--test')
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
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || '',
  XAI_API_KEY: process.env.XAI_API_KEY || '',
}

// ─── Types ──────────────────────────────────────────────

interface TestResult {
  suite: string
  model: string
  status: 'ok' | 'ko' | 'skip'
  time: number
  chars: number
  detail: string
  meta?: Record<string, any>
}

const results: TestResult[] = []

// ─── Helpers ────────────────────────────────────────────

async function fetchApi (url: string, body: any, headers: Record<string, string>, label: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${label} ${res.status}: ${err.slice(0, 300)}`)
  }
  return res.json()
}

function log (msg: string) {
  if (VERBOSE) console.log(`  ${msg}`)
}

// Texte long pour tester le caching
// Anthropic : min 1024 tokens (Sonnet), 4096 tokens (Haiku/Opus) ≈ ~16000 chars
// OpenAI : min 1024 tokens ≈ ~4000 chars
function makeLongContext (targetChars = 18000): string {
  const paragraphs = [
    'L\'éducation est le fondement de toute société. Elle permet aux individus de développer leur esprit critique, leur créativité et leurs compétences sociales. Un système éducatif efficace doit être accessible à tous et s\'adapter aux besoins de chaque élève.',
    'Les mathématiques sont une discipline fondamentale qui enseigne la logique, le raisonnement abstrait et la résolution de problèmes complexes. Elles constituent le socle de nombreuses sciences et technologies modernes, de l\'informatique à l\'ingénierie.',
    'La littérature française est riche et variée, allant des œuvres médiévales aux romans contemporains. Elle reflète les préoccupations de chaque époque et permet aux lecteurs de mieux comprendre la condition humaine à travers les siècles.',
    'Les sciences naturelles nous permettent de comprendre le monde qui nous entoure, des plus petites particules subatomiques aux plus grandes structures de l\'univers. La biologie, la chimie et la physique sont interconnectées et forment un ensemble cohérent.',
    'L\'histoire est un miroir du passé qui nous aide à comprendre le présent et à anticiper l\'avenir. Elle est essentielle pour former des citoyens éclairés capables de participer pleinement à la vie démocratique de leur société.',
    'La géographie étudie les relations entre les sociétés humaines et leur environnement naturel. Elle nous apprend à penser l\'espace, ses enjeux territoriaux, climatiques et géopolitiques dans un monde de plus en plus interconnecté.',
    'La philosophie nous invite à questionner nos certitudes, à examiner nos croyances et à développer une pensée autonome et rigoureuse. Elle est le fondement même de la réflexion critique et de l\'éthique qui guide nos choix collectifs.',
    'L\'apprentissage des langues étrangères ouvre des portes vers d\'autres cultures et favorise la compréhension mutuelle entre les peuples. Dans un monde globalisé, la maîtrise de plusieurs langues est un atout considérable.',
    'L\'enseignement des arts — musique, peinture, théâtre, danse — développe la sensibilité, la créativité et l\'expression personnelle. Ces disciplines sont essentielles à l\'épanouissement complet de chaque individu.',
    'L\'éducation physique et sportive contribue au bien-être physique et mental des élèves. Elle enseigne le dépassement de soi, l\'esprit d\'équipe et le respect des règles, des valeurs transférables à tous les domaines de la vie.',
  ]
  let result = ''
  let i = 0
  while (result.length < targetChars) {
    result += paragraphs[i % paragraphs.length] + '\n\n'
    i++
  }
  return result
}

// Barème factice pour le test de correction
const FAKE_BAREME = JSON.stringify({
  total: 10,
  questions: [
    { id: '1', titre: 'Identifier le sujet', points: 3, criteres: [{ question: '1)', description: 'Le sujet est correctement identifié', points: 3 }] },
    { id: '2', titre: 'Conjugaison', points: 4, criteres: [{ question: '2)', description: 'Le verbe est correctement conjugué', points: 4 }] },
    { id: '3', titre: 'Rédaction', points: 3, criteres: [{ question: '3)', description: 'La phrase est bien rédigée', points: 3 }] },
  ],
})

const FAKE_COPIE = `# Copie de l'élève

## Question 1
Le sujet de la phrase "Les enfants jouent dans le parc" est "Les enfants".

## Question 2
Le verbe "manger" conjugué au passé composé avec "nous" donne : "nous avons mangé".

## Question 3
Les vacances sont un moment important car elles permettent de se reposer et de passer du temps en famille.`

// ─── Test suites ────────────────────────────────────────

// ============================================================
// TEST 1 : Connectivité de base
// ============================================================
async function testConnectivity () {
  const models: { id: string; provider: string; apiKey: string }[] = [
    { id: 'gpt-4o-mini', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gpt-5-nano', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gpt-5.2', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gpt-5.2-pro', provider: 'openai-responses', apiKey: ENV.OPENAI_API_KEY },
    { id: 'claude-haiku-4-5', provider: 'anthropic', apiKey: ENV.ANTHROPIC_API_KEY },
    { id: 'claude-sonnet-4-5', provider: 'anthropic', apiKey: ENV.ANTHROPIC_API_KEY },
    { id: 'claude-opus-4-6', provider: 'anthropic', apiKey: ENV.ANTHROPIC_API_KEY },
    { id: 'gemini-3-flash', provider: 'google', apiKey: ENV.GOOGLE_API_KEY },
    { id: 'gemini-3-pro', provider: 'google', apiKey: ENV.GOOGLE_API_KEY },
    { id: 'deepseek-v3.2', provider: 'deepseek', apiKey: ENV.DEEPSEEK_API_KEY },
    { id: 'kimi-k2.5', provider: 'moonshot', apiKey: ENV.MOONSHOT_API_KEY },
    { id: 'kimi-k2-thinking', provider: 'moonshot', apiKey: ENV.MOONSHOT_API_KEY },
    { id: 'grok-4', provider: 'xai', apiKey: ENV.XAI_API_KEY },
  ]

  for (const m of models) {
    if (MODEL_FILTER && m.id !== MODEL_FILTER) continue
    if (!m.apiKey) {
      results.push({ suite: 'connectivity', model: m.id, status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
      continue
    }

    const t0 = performance.now()
    try {
      const text = await callModel(m.id, m.provider, m.apiKey, 'Réponds uniquement "OK".', 'Tu es un assistant.')
      const elapsed = performance.now() - t0
      log(`${m.id}: "${text.slice(0, 100)}"`)
      results.push({ suite: 'connectivity', model: m.id, status: 'ok', time: elapsed, chars: text.length, detail: text.slice(0, 50) })
    } catch (err: any) {
      results.push({ suite: 'connectivity', model: m.id, status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
    }
  }
}

// ============================================================
// TEST 2 : JSON mode
// ============================================================
async function testJsonMode () {
  const prompt = 'Réponds avec un objet JSON contenant exactement : {"status": "ok", "message": "hello"}. Rien d\'autre.'
  const models: { id: string; provider: string; apiKey: string }[] = [
    { id: 'gpt-4o-mini', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gpt-5.2', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gpt-5.2-pro', provider: 'openai-responses', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gemini-3-flash', provider: 'google', apiKey: ENV.GOOGLE_API_KEY },
    { id: 'deepseek-v3.2', provider: 'deepseek', apiKey: ENV.DEEPSEEK_API_KEY },
    { id: 'grok-4', provider: 'xai', apiKey: ENV.XAI_API_KEY },
  ]

  for (const m of models) {
    if (MODEL_FILTER && m.id !== MODEL_FILTER) continue
    if (!m.apiKey) {
      results.push({ suite: 'json-mode', model: m.id, status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
      continue
    }

    const t0 = performance.now()
    try {
      const text = await callModel(m.id, m.provider, m.apiKey, prompt, 'Tu es un assistant JSON.', { jsonMode: true })
      const elapsed = performance.now() - t0
      const parsed = JSON.parse(text)
      log(`${m.id} JSON: ${JSON.stringify(parsed)}`)
      results.push({ suite: 'json-mode', model: m.id, status: 'ok', time: elapsed, chars: text.length, detail: `JSON valide — ${JSON.stringify(parsed).slice(0, 60)}` })
    } catch (err: any) {
      results.push({ suite: 'json-mode', model: m.id, status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
    }
  }
}

// ============================================================
// TEST 3 : Prompt caching Anthropic
// ============================================================
async function testCacheAnthropic () {
  const models = ['claude-haiku-4-5', 'claude-sonnet-4-5']

  if (!ENV.ANTHROPIC_API_KEY) {
    for (const m of models) results.push({ suite: 'cache-anthropic', model: m, status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
    return
  }

  const longContext = makeLongContext()
  const modelMap: Record<string, string> = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  }

  for (const modelId of models) {
    if (MODEL_FILTER && modelId !== MODEL_FILTER) continue

    // Appel 1 : écriture du cache
    const t1 = performance.now()
    try {
      const data1 = await fetchApi(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelMap[modelId],
          max_tokens: 100,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: longContext, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: 'Résume en une phrase ce contexte éducatif.' },
            ],
          }],
        },
        { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        'Anthropic'
      )

      const write1 = data1.usage?.cache_creation_input_tokens ?? 0
      const read1 = data1.usage?.cache_read_input_tokens ?? 0
      const text1 = data1.content?.find((b: any) => b.type === 'text')?.text ?? ''
      log(`${modelId} call1 — write: ${write1}, read: ${read1}, text: "${text1.slice(0, 60)}"`)

      // Appel 2 : lecture du cache (même préfixe, question différente)
      const t2 = performance.now()
      const data2 = await fetchApi(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelMap[modelId],
          max_tokens: 100,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: longContext, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: 'Quel est le thème principal de ce contexte ?' },
            ],
          }],
        },
        { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        'Anthropic'
      )

      const write2 = data2.usage?.cache_creation_input_tokens ?? 0
      const read2 = data2.usage?.cache_read_input_tokens ?? 0
      const elapsed = performance.now() - t1
      const cacheHit = read2 > 0

      log(`${modelId} call2 — write: ${write2}, read: ${read2}, cache_hit: ${cacheHit}`)

      results.push({
        suite: 'cache-anthropic',
        model: modelId,
        status: cacheHit ? 'ok' : 'ko',
        time: elapsed,
        chars: text1.length,
        detail: cacheHit
          ? `Cache HIT ✓ — write: ${write1}, read: ${read2} tokens`
          : `Cache MISS — call1 write: ${write1}, call2 write: ${write2}, read: ${read2}`,
        meta: { write1, read1, write2, read2 },
      })
    } catch (err: any) {
      results.push({ suite: 'cache-anthropic', model: modelId, status: 'ko', time: performance.now() - t1, chars: 0, detail: err.message.slice(0, 120) })
    }
  }
}

// ============================================================
// TEST 4 : Adaptive thinking (Opus 4.6)
// ============================================================
async function testThinkingOpus () {
  if (MODEL_FILTER && MODEL_FILTER !== 'claude-opus-4-6') return
  if (!ENV.ANTHROPIC_API_KEY) {
    results.push({ suite: 'thinking-opus', model: 'claude-opus-4-6', status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
    return
  }

  const t0 = performance.now()
  try {
    const data = await fetchApi(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-6',
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        messages: [{
          role: 'user',
          content: 'Réponds avec un JSON valide : {"status": "ok", "thinking": true}. Rien d\'autre.',
        }],
      },
      { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      'Anthropic'
    )

    const elapsed = performance.now() - t0
    const thinkingBlock = data.content?.find((b: any) => b.type === 'thinking')
    const textBlock = data.content?.find((b: any) => b.type === 'text')
    const stopReason = data.stop_reason
    const text = textBlock?.text ?? ''

    log(`Opus thinking — stop: ${stopReason}, thinking: ${thinkingBlock ? thinkingBlock.thinking.length + ' chars' : 'none'}, text: "${text.slice(0, 100)}"`)

    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}

    const isOk = text.length > 5 && stopReason === 'end_turn'
    results.push({
      suite: 'thinking-opus',
      model: 'claude-opus-4-6',
      status: isOk ? 'ok' : 'ko',
      time: elapsed,
      chars: text.length,
      detail: isOk
        ? `stop=${stopReason}, thinking=${thinkingBlock ? 'yes' : 'no'}, json=${parsed ? 'valid' : 'invalid'}`
        : `stop=${stopReason}, text_len=${text.length} — réponse possiblement tronquée`,
      meta: { stopReason, hasThinking: !!thinkingBlock, jsonValid: !!parsed },
    })
  } catch (err: any) {
    results.push({ suite: 'thinking-opus', model: 'claude-opus-4-6', status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
  }
}

// ============================================================
// TEST 5 : OpenAI Responses API (GPT-5.2 Pro)
// ============================================================
async function testResponsesApi () {
  if (MODEL_FILTER && MODEL_FILTER !== 'gpt-5.2-pro') return
  if (!ENV.OPENAI_API_KEY) {
    results.push({ suite: 'responses-api', model: 'gpt-5.2-pro', status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
    return
  }

  const t0 = performance.now()
  try {
    const data = await fetchApi(
      'https://api.openai.com/v1/responses',
      {
        model: 'gpt-5.2-pro-2025-12-11',
        instructions: 'Tu es un assistant. Réponds toujours en format JSON.',
        input: 'Réponds avec un objet JSON contenant : {"status": "ok", "api": "responses"}',
        store: false,
        reasoning: { effort: 'medium' },
        text: { format: { type: 'json_object' } },
      },
      { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` },
      'OpenAI-Responses'
    )

    const elapsed = performance.now() - t0
    const messageOutput = data.output?.find((o: any) => o.type === 'message')
    const text = messageOutput?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''
    const cached = data.usage?.input_tokens_details?.cached_tokens ?? 0

    log(`GPT-5.2 Pro — text: "${text.slice(0, 100)}", cached: ${cached}`)

    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}

    results.push({
      suite: 'responses-api',
      model: 'gpt-5.2-pro',
      status: parsed ? 'ok' : 'ko',
      time: elapsed,
      chars: text.length,
      detail: parsed ? `JSON valid — ${JSON.stringify(parsed).slice(0, 80)}` : `JSON parse failed: "${text.slice(0, 80)}"`,
      meta: { cached, input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens },
    })
  } catch (err: any) {
    results.push({ suite: 'responses-api', model: 'gpt-5.2-pro', status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
  }
}

// ============================================================
// TEST 6 : Prefill Anthropic ({)
// ============================================================
async function testPrefill () {
  const models = ['claude-haiku-4-5', 'claude-sonnet-4-5']
  const modelMap: Record<string, string> = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  }

  if (!ENV.ANTHROPIC_API_KEY) {
    for (const m of models) results.push({ suite: 'prefill', model: m, status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
    return
  }

  for (const modelId of models) {
    if (MODEL_FILTER && modelId !== MODEL_FILTER) continue

    const t0 = performance.now()
    try {
      const data = await fetchApi(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelMap[modelId],
          max_tokens: 200,
          temperature: 0,
          messages: [
            { role: 'user', content: 'Réponds UNIQUEMENT avec du JSON : {"status": "ok", "prefill": true}' },
            { role: 'assistant', content: '{' },
          ],
        },
        { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        'Anthropic'
      )

      const elapsed = performance.now() - t0
      const rawText = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
      const text = '{' + rawText

      let parsed: any = null
      try { parsed = JSON.parse(text) } catch {}

      log(`${modelId} prefill — raw: "${rawText.slice(0, 60)}", combined: "${text.slice(0, 80)}"`)

      results.push({
        suite: 'prefill',
        model: modelId,
        status: parsed ? 'ok' : 'ko',
        time: elapsed,
        chars: text.length,
        detail: parsed ? `Prefill OK — ${JSON.stringify(parsed).slice(0, 60)}` : `JSON parse failed: "${text.slice(0, 60)}"`,
      })
    } catch (err: any) {
      results.push({ suite: 'prefill', model: modelId, status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
    }
  }
}

// ============================================================
// TEST 7 : Correction complète (prompt réaliste)
// ============================================================
async function testCorrection () {
  const models: { id: string; provider: string; apiKey: string }[] = [
    { id: 'claude-sonnet-4-5', provider: 'anthropic', apiKey: ENV.ANTHROPIC_API_KEY },
    { id: 'gpt-5.2', provider: 'openai', apiKey: ENV.OPENAI_API_KEY },
    { id: 'gemini-3-flash', provider: 'google', apiKey: ENV.GOOGLE_API_KEY },
  ]

  const correctionPrompt = `Tu es un correcteur de copies de Français, niveau 3ème. Corrige la copie avec le barème suivant.

Sévérité : Classique

Barème validé :
${FAKE_BAREME}

Copie de l'élève :
${FAKE_COPIE}

Réponds UNIQUEMENT avec du JSON valide :
{
  "note_globale": 0,
  "total": 10,
  "questions": [
    { "id": "1", "titre": "Identifier le sujet", "note": 0, "points_max": 3, "justification": "...", "erreurs": [] },
    { "id": "2", "titre": "Conjugaison", "note": 0, "points_max": 4, "justification": "...", "erreurs": [] },
    { "id": "3", "titre": "Rédaction", "note": 0, "points_max": 3, "justification": "...", "erreurs": [] }
  ],
  "points_a_corriger": [],
  "commentaire": ""
}`

  for (const m of models) {
    if (MODEL_FILTER && m.id !== MODEL_FILTER) continue
    if (!m.apiKey) {
      results.push({ suite: 'correction', model: m.id, status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
      continue
    }

    const t0 = performance.now()
    try {
      const text = await callModel(m.id, m.provider, m.apiKey, correctionPrompt, '', { jsonMode: true })
      const elapsed = performance.now() - t0

      // Nettoyer le JSON (enlever les blocs markdown si présents)
      let cleanJson = text.trim()
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      }

      let parsed: any = null
      try { parsed = JSON.parse(cleanJson) } catch {}

      const hasQuestions = parsed?.questions?.length === 3
      const hasNote = typeof parsed?.note_globale === 'number'

      log(`${m.id} correction — note: ${parsed?.note_globale}/${parsed?.total}, questions: ${parsed?.questions?.length}`)

      results.push({
        suite: 'correction',
        model: m.id,
        status: hasQuestions && hasNote ? 'ok' : 'ko',
        time: elapsed,
        chars: text.length,
        detail: hasQuestions && hasNote
          ? `${parsed.note_globale}/${parsed.total} — ${parsed.questions.length} questions`
          : `Structure invalide — questions: ${parsed?.questions?.length ?? 'N/A'}, note: ${parsed?.note_globale ?? 'N/A'}`,
      })
    } catch (err: any) {
      results.push({ suite: 'correction', model: m.id, status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
    }
  }
}

// ============================================================
// TEST 8 : Cache automatique OpenAI (prefix caching)
// ============================================================
async function testCacheOpenAI () {
  if (MODEL_FILTER && MODEL_FILTER !== 'gpt-5.2') return
  if (!ENV.OPENAI_API_KEY) {
    results.push({ suite: 'cache-openai', model: 'gpt-5.2', status: 'skip', time: 0, chars: 0, detail: 'API key manquante' })
    return
  }

  const longContext = makeLongContext()
  const t0 = performance.now()

  try {
    // Appel 1 : seed du cache
    const data1 = await fetchApi(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-5.2-2025-12-11',
        messages: [
          { role: 'system', content: longContext },
          { role: 'user', content: 'Résume en une phrase.' },
        ],
        temperature: 0,
        seed: 42,
      },
      { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` },
      'OpenAI'
    )
    const cached1 = data1.usage?.prompt_tokens_details?.cached_tokens ?? 0

    // Appel 2 : même préfixe, question différente
    const data2 = await fetchApi(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-5.2-2025-12-11',
        messages: [
          { role: 'system', content: longContext },
          { role: 'user', content: 'Quel est le sujet principal ?' },
        ],
        temperature: 0,
        seed: 42,
      },
      { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` },
      'OpenAI'
    )

    const elapsed = performance.now() - t0
    const cached2 = data2.usage?.prompt_tokens_details?.cached_tokens ?? 0
    const cacheHit = cached2 > 0

    log(`GPT-5.2 cache — call1 cached: ${cached1}, call2 cached: ${cached2}`)

    // Le cache automatique OpenAI peut prendre quelques secondes — un miss n'est pas un KO
    results.push({
      suite: 'cache-openai',
      model: 'gpt-5.2',
      status: 'ok',
      time: elapsed,
      chars: data2.choices?.[0]?.message?.content?.length ?? 0,
      detail: cacheHit
        ? `Cache HIT ✓ — cached: ${cached2} tokens`
        : `Cache MISS (normal au 1er run) — call1: ${cached1}, call2: ${cached2}`,
      meta: { cached1, cached2 },
    })
  } catch (err: any) {
    results.push({ suite: 'cache-openai', model: 'gpt-5.2', status: 'ko', time: performance.now() - t0, chars: 0, detail: err.message.slice(0, 120) })
  }
}

// ─── Model callers (direct API, pas via lib/) ───────────

async function callModel (
  modelId: string,
  provider: string,
  apiKey: string,
  userPrompt: string,
  systemPrompt: string,
  options?: { jsonMode?: boolean }
): Promise<string> {
  switch (provider) {
    case 'openai': return callOpenAIDirect(modelId, systemPrompt, userPrompt, apiKey, options)
    case 'openai-responses': return callOpenAIResponsesDirect(modelId, systemPrompt, userPrompt, apiKey, options)
    case 'anthropic': return callAnthropicDirect(modelId, systemPrompt, userPrompt, apiKey)
    case 'google': return callGeminiDirect(modelId, systemPrompt, userPrompt, apiKey, options)
    case 'deepseek': return callDeepSeekDirect(systemPrompt, userPrompt, apiKey, options)
    case 'moonshot': return callMoonshotDirect(modelId, systemPrompt, userPrompt, apiKey, options)
    case 'xai': return callXAIDirect(systemPrompt, userPrompt, apiKey, options)
    default: throw new Error(`Provider inconnu: ${provider}`)
  }
}

async function callOpenAIDirect (model: string, system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const modelMap: Record<string, string> = { 'gpt-4o-mini': 'gpt-4o-mini-2024-07-18', 'gpt-5-nano': 'gpt-5-nano-2025-08-07', 'gpt-5.2': 'gpt-5.2-2025-12-11' }
  const body: any = { model: modelMap[model] || model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
  if (model !== 'gpt-5-nano') { body.temperature = 0; body.seed = 42 }
  if (options?.jsonMode) body.response_format = { type: 'json_object' }
  const data = await fetchApi('https://api.openai.com/v1/chat/completions', body, { Authorization: `Bearer ${key}` }, 'OpenAI')
  return data.choices[0].message.content
}

async function callOpenAIResponsesDirect (model: string, system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const body: any = { model: 'gpt-5.2-pro-2025-12-11', input: user, store: false, reasoning: { effort: 'medium' } }
  if (system) body.instructions = system
  if (options?.jsonMode) body.text = { format: { type: 'json_object' } }
  const data = await fetchApi('https://api.openai.com/v1/responses', body, { Authorization: `Bearer ${key}` }, 'OpenAI-Responses')
  const msg = data.output?.find((o: any) => o.type === 'message')
  return msg?.content?.find((c: any) => c.type === 'output_text')?.text ?? ''
}

async function callAnthropicDirect (model: string, system: string, user: string, key: string): Promise<string> {
  const modelMap: Record<string, string> = { 'claude-haiku-4-5': 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929', 'claude-opus-4-6': 'claude-opus-4-6' }
  const isAdaptive = model === 'claude-opus-4-6'
  const body: any = { model: modelMap[model] || model, max_tokens: isAdaptive ? 32000 : 1024, messages: [{ role: 'user', content: user }] }
  if (system) body.system = system
  if (isAdaptive) { body.thinking = { type: 'adaptive' } } else { body.temperature = 0 }
  const data = await fetchApi('https://api.anthropic.com/v1/messages', body, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, 'Anthropic')
  const text = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
  return text
}

async function callGeminiDirect (model: string, system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const modelMap: Record<string, string> = { 'gemini-3-flash': 'gemini-3-flash-preview', 'gemini-3-pro': 'gemini-3-pro-preview' }
  const modelName = modelMap[model] || model
  const genConfig: any = { temperature: 0 }
  if (options?.jsonMode) genConfig.responseMimeType = 'application/json'
  const body: any = { contents: [{ parts: [{ text: user }] }], generationConfig: genConfig }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const data = await fetchApi(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`, body, {}, 'Gemini')
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error(`Gemini réponse vide (${data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '?'})`)
  return data.candidates[0].content.parts[0].text
}

async function callDeepSeekDirect (system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const body: any = { model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0 }
  if (options?.jsonMode) body.response_format = { type: 'json_object' }
  const data = await fetchApi('https://api.deepseek.com/chat/completions', body, { Authorization: `Bearer ${key}` }, 'DeepSeek')
  return data.choices[0].message.content
}

async function callMoonshotDirect (model: string, system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const body: any = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
  // kimi-k2.5 : temperature non modifiable, thinking activé par défaut
  if (model === 'kimi-k2.5') {
    body.thinking = { type: 'enabled' }
  } else if (model !== 'kimi-k2-thinking') {
    body.temperature = 0
  }
  if (options?.jsonMode) body.response_format = { type: 'json_object' }
  const data = await fetchApi('https://api.moonshot.ai/v1/chat/completions', body, { Authorization: `Bearer ${key}` }, 'Moonshot')
  return data.choices[0].message.content
}

async function callXAIDirect (system: string, user: string, key: string, options?: { jsonMode?: boolean }): Promise<string> {
  const body: any = { model: 'grok-4', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
  if (options?.jsonMode) body.response_format = { type: 'json_object' }
  const data = await fetchApi('https://api.x.ai/v1/chat/completions', body, { Authorization: `Bearer ${key}` }, 'xAI')
  return data.choices[0].message.content
}

// ─── Display ────────────────────────────────────────────

function printResults () {
  const suites = [...new Set(results.map((r) => r.suite))]

  console.log('\n' + '═'.repeat(110))
  console.log('  RÉSULTATS DES TESTS LLM')
  console.log('═'.repeat(110))

  for (const suite of suites) {
    const suiteResults = results.filter((r) => r.suite === suite)
    console.log(`\n┌─ ${suite.toUpperCase()} ${'─'.repeat(Math.max(0, 105 - suite.length))}┐`)

    for (const r of suiteResults) {
      const icon = r.status === 'ok' ? '✅' : r.status === 'ko' ? '❌' : '⏭️'
      const time = r.status === 'skip' ? '    —' : `${(r.time / 1000).toFixed(1).padStart(5)}s`
      const chars = r.status === 'skip' ? '      ' : `${String(r.chars).padStart(5)}ch`
      const model = r.model.padEnd(22)
      const detail = r.detail.slice(0, 60)
      console.log(`│ ${icon} ${model} ${time}  ${chars}  ${detail}`)
    }

    console.log(`└${'─'.repeat(108)}┘`)
  }

  // Résumé
  const ok = results.filter((r) => r.status === 'ok').length
  const ko = results.filter((r) => r.status === 'ko').length
  const skip = results.filter((r) => r.status === 'skip').length
  const total = results.length

  console.log(`\n${'─'.repeat(110)}`)
  console.log(`  ${ok}/${total - skip} OK  |  ${ko} KO  |  ${skip} SKIP`)

  if (ko > 0) {
    console.log(`\n  ❌ ERREURS :`)
    for (const r of results.filter((r) => r.status === 'ko')) {
      console.log(`     ${r.suite} / ${r.model} — ${r.detail}`)
    }
  }

  console.log('─'.repeat(110) + '\n')
}

// ─── Main ───────────────────────────────────────────────

const SUITES: Record<string, () => Promise<void>> = {
  connectivity: testConnectivity,
  'json-mode': testJsonMode,
  'cache-anthropic': testCacheAnthropic,
  'thinking-opus': testThinkingOpus,
  'responses-api': testResponsesApi,
  prefill: testPrefill,
  correction: testCorrection,
  'cache-openai': testCacheOpenAI,
}

async function main () {
  console.log('\n🧪 Test LLM Battery')
  console.log(`   ${TEST_FILTER ? `Suite: ${TEST_FILTER}` : 'Toutes les suites'}`)
  console.log(`   ${MODEL_FILTER ? `Modèle: ${MODEL_FILTER}` : 'Tous les modèles'}`)
  console.log(`   Verbose: ${VERBOSE}\n`)

  const suitesToRun = TEST_FILTER
    ? { [TEST_FILTER]: SUITES[TEST_FILTER] }
    : SUITES

  for (const [name, fn] of Object.entries(suitesToRun)) {
    if (!fn) {
      console.log(`⚠️  Suite inconnue: ${name}`)
      continue
    }
    process.stdout.write(`⏳ ${name}...`)
    const t0 = performance.now()
    await fn()
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    const suiteOk = results.filter((r) => r.suite === name && r.status === 'ok').length
    const suiteTotal = results.filter((r) => r.suite === name && r.status !== 'skip').length
    console.log(` ${suiteOk}/${suiteTotal} OK (${elapsed}s)`)
  }

  printResults()
  process.exit(results.some((r) => r.status === 'ko') ? 1 : 0)
}

main()
