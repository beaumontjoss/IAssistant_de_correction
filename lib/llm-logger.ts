import { join } from 'path'

const IS_VERCEL = !!process.env.VERCEL
const LOG_DIR = join(process.cwd(), 'logs_appels_llm')

export interface LLMLogEntry {
  type: 'correction' | 'bareme' | 'transcription' | 'transcription-doc' | 'transcription-copie'
  model: string
  provider: string
  prompt: {
    static?: string
    variable?: string
    full?: string
  }
  messages: any[]
  options?: {
    jsonMode?: boolean
    prefill?: boolean
  }
  response_raw: string
  response_parsed?: any
  error?: string
  meta: {
    elapsed_ms: number
    timestamp: string
    [key: string]: any
  }
}

let dirReady = false

async function ensureDir () {
  if (dirReady) return
  try {
    const { mkdir } = await import('fs/promises')
    await mkdir(LOG_DIR, { recursive: true })
    dirReady = true
  } catch {}
}

function formatTimestamp (date: Date): string {
  return date.toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '')
}

/**
 * Écrit un log d'appel LLM.
 * - En local : fichier JSON dans logs_appels_llm/
 * - Sur Vercel : console.log (consultable dans le dashboard Vercel > Logs)
 */
export async function logLLMCall (entry: LLMLogEntry): Promise<string | null> {
  const ts = formatTimestamp(new Date())
  const label = `${ts}_${entry.type}_${entry.model}`

  // Sur Vercel : filesystem read-only → log dans console uniquement
  if (IS_VERCEL) {
    console.log(`[LOG] ${label} — ${entry.meta.elapsed_ms}ms — response: ${entry.response_raw.length} chars`)
    return null
  }

  // En local : écriture fichier JSON
  try {
    await ensureDir()
    const filename = `${label}.json`
    const filepath = join(LOG_DIR, filename)
    const { writeFile } = await import('fs/promises')
    await writeFile(filepath, JSON.stringify(entry, null, 2), 'utf-8')
    console.log(`[LOG] 📄 ${filename}`)
    return filepath
  } catch (err) {
    console.warn('[LOG] ⚠️ Écriture log échouée:', err instanceof Error ? err.message : err)
    return null
  }
}
