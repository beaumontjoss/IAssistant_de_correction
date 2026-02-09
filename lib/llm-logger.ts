import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const LOG_DIR = join(process.cwd(), 'logs_appels_llm')

export interface LLMLogEntry {
  type: 'correction' | 'bareme' | 'transcription'
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
 * Écrit un log d'appel LLM dans logs_appels_llm/.
 * Non bloquant : les erreurs d'écriture sont ignorées silencieusement.
 */
export async function logLLMCall (entry: LLMLogEntry): Promise<string | null> {
  try {
    await ensureDir()
    const ts = formatTimestamp(new Date())
    const filename = `${ts}_${entry.type}_${entry.model}.json`
    const filepath = join(LOG_DIR, filename)
    await writeFile(filepath, JSON.stringify(entry, null, 2), 'utf-8')
    console.log(`[LOG] 📄 ${filename}`)
    return filepath
  } catch (err) {
    console.warn('[LOG] ⚠️ Écriture log échouée:', err instanceof Error ? err.message : err)
    return null
  }
}
