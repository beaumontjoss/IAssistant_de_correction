import { NextRequest, NextResponse } from 'next/server'
import { callLLM, buildTextMessages } from '@/lib/api-clients'
import { getCorrectionPrompt } from '@/lib/prompts'

export async function POST (req: NextRequest) {
  try {
    const body = await req.json()
    const { modelId, matiere, classe, severite, baremeJson, mdCopie, corrigeText } = body

    if (!modelId || !matiere || !classe || !severite || !baremeJson || !mdCopie) {
      return NextResponse.json(
        { error: 'Parametres manquants' },
        { status: 400 }
      )
    }

    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
    }

    const prompt = getCorrectionPrompt(
      matiere,
      classe,
      severite,
      baremeJson,
      mdCopie,
      corrigeText || undefined
    )

    const messages = buildTextMessages('', prompt)
    const result = await callLLM(modelId, messages, env)

    // Parse JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Reponse invalide du modele' },
        { status: 500 }
      )
    }

    const correction = JSON.parse(jsonMatch[0])
    return NextResponse.json({ correction })
  } catch (err: unknown) {
    console.error('Erreur correction:', err)
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
