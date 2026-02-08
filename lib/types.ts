export type Severite = 'indulgente' | 'classique' | 'severe'

export type Matiere =
  | 'Francais'
  | 'Mathematiques'
  | 'Histoire-Geographie'
  | 'SVT'
  | 'Physique-Chimie'
  | 'Philosophie'
  | 'Anglais'
  | 'Espagnol'
  | 'Autre'

export const MATIERES: { value: Matiere; label: string }[] = [
  { value: 'Francais', label: 'Français' },
  { value: 'Mathematiques', label: 'Mathématiques' },
  { value: 'Histoire-Geographie', label: 'Histoire-Géographie' },
  { value: 'SVT', label: 'SVT' },
  { value: 'Physique-Chimie', label: 'Physique-Chimie' },
  { value: 'Philosophie', label: 'Philosophie' },
  { value: 'Anglais', label: 'Anglais' },
  { value: 'Espagnol', label: 'Espagnol' },
  { value: 'Autre', label: 'Autre' },
]

export interface TranscriptionModel {
  id: string
  label: string
  provider: string
  isMultimodal: true
}

export interface CorrectionModel {
  id: string
  label: string
  provider: string
  isMultimodal: boolean
}

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
  { id: 'mistral-ocr', label: 'Mistral OCR', provider: 'mistral', isMultimodal: true },
  { id: 'google-vision', label: 'Google Cloud Vision', provider: 'google-vision', isMultimodal: true },
  { id: 'azure-di', label: 'Azure Document Intelligence', provider: 'azure', isMultimodal: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic', isMultimodal: true },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic', isMultimodal: true },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', isMultimodal: true },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', isMultimodal: true },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano', provider: 'openai', isMultimodal: true },
  { id: 'grok-4-1-fast', label: 'Grok 4.1 Fast', provider: 'xai', isMultimodal: true },
  { id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast (Reasoning)', provider: 'xai', isMultimodal: true },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', provider: 'google', isMultimodal: true },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', provider: 'google', isMultimodal: true },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', provider: 'moonshot', isMultimodal: true },
]

export const CORRECTION_MODELS: CorrectionModel[] = [
  ...TRANSCRIPTION_MODELS,
  { id: 'deepseek-v3.2', label: 'DeepSeek V3.2 (Thinking)', provider: 'deepseek', isMultimodal: false },
  { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking', provider: 'moonshot', isMultimodal: false },
]

export const TEXT_ONLY_MODELS = ['deepseek-v3.2', 'kimi-k2-thinking']

export interface BaremeCritere {
  question: string      // réf. comme "1)a)", "2)" — vide pour les critères thématiques (dissertation)
  description: string   // texte du critère
  points: number        // points pour ce critère
}

export interface BaremeQuestion {
  id: string
  titre: string
  points: number
  criteres: BaremeCritere[]
}

export interface Bareme {
  total: number
  questions: BaremeQuestion[]
}

export interface CorrectionQuestion {
  id: string
  titre: string
  note: number
  points_max: number
  justification: string
  erreurs: string[]
}

export interface Correction {
  note_globale: number
  total: number
  questions: CorrectionQuestion[]
  points_a_corriger: string[]
  commentaire: string
}

export interface CopieEleve {
  id: string
  nom_eleve: string
  images: string[]
  transcription_md: string | null
  transcription_validee: boolean
  correction: Correction | null
}

export interface ControlData {
  id: string
  classe: string
  matiere: string
  severite: Severite
  modele_correction: string
  enonce_images: string[]
  corrige_images: string[]
  bareme: Bareme | null
  copies: CopieEleve[]
  currentStep: number
}

export function createEmptyControl (): ControlData {
  return {
    id: crypto.randomUUID(),
    classe: '',
    matiere: 'Francais',
    severite: 'classique',
    modele_correction: 'claude-sonnet-4-5',
    enonce_images: [],
    corrige_images: [],
    bareme: null,
    copies: [],
    currentStep: 1,
  }
}
