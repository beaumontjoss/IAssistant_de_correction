'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { ImageViewer } from '@/components/image-viewer/image-viewer'
import { MarkdownEditor } from '@/components/markdown-editor/markdown-editor'
import { SeverityToggle } from '@/components/ui/severity-toggle'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getControle, saveControle } from '@/lib/db'
import { processFiles } from '@/lib/image-utils'
import {
  MATIERES,
  CORRECTION_MODELS,
  type Controle,
  type Severite,
  type BaremeQuestion,
  type BaremeCritere,
} from '@/lib/types'
import {
  BookOpen,
  Settings,
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Sparkles,
  ClipboardList,
  RotateCcw,
  FileText,
} from 'lucide-react'
import Link from 'next/link'

// Anecdotes insolites et vérifiées sur l'éducation
const ANECDOTES = [
  'Émile Zola a échoué deux fois au baccalauréat, en 1859. Il n\'a jamais obtenu le diplôme.',
  'Napoléon est sorti 42e sur 58 de l\'École militaire de Paris, en 1785.',
  'Le baccalauréat a été créé par Napoléon en 1808. La première session, en 1809, ne comptait que 33 reçus… et uniquement des épreuves orales, en latin et en grec.',
  'Julie-Victoire Daubié est devenue la première femme bachelière de France en 1861, à 37 ans. Le ministre a d\'abord refusé de signer son diplôme, qu\'il jugeait « ridicule ».',
  'Pierre Curie n\'est jamais allé à l\'école. Instruit à domicile par son père, il a obtenu son bac à 16 ans… puis le prix Nobel.',
  'Le stylo à bille était interdit dans les écoles françaises. Il a fallu attendre une circulaire ministérielle de septembre 1965 pour l\'autoriser en classe.',
  'Jules Ferry a rendu l\'école primaire gratuite en 1881, puis obligatoire en 1882. Avant cela, seuls les enfants de familles aisées allaient à l\'école.',
  'Albert Einstein n\'a jamais été mauvais en maths — c\'est un mythe tenace. Il excellait en mathématiques et en physique dès le lycée.',
  'Le mot « baccalauréat » vient du latin bacca laurea, la « baie de laurier », symbole de victoire dans l\'Antiquité.',
  'Jacques Prévert a quitté l\'école à 15 ans, sans aucun diplôme. Cela ne l\'a pas empêché d\'écrire des poèmes que tous les écoliers apprennent encore.',
  'En 1900, seuls 1 % des Français obtenaient le baccalauréat. Aujourd\'hui, le taux de réussite dépasse les 85 %.',
  'Le père de Victor Hugo voulait qu\'il intègre Polytechnique. Il a préféré la littérature — et est devenu le plus grand poète français.',
  'Thomas Edison a été retiré de l\'école par sa mère après que son instituteur l\'a qualifié d\'« embrouillé ». Elle l\'a instruit à domicile.',
  'Avant 1965, les écoliers français écrivaient avec une plume Sergent-Major trempée dans un encrier en porcelaine rempli d\'encre violette.',
  'En 1857, Mérimée a composé une dictée pour la cour impériale. Napoléon III a fait 75 fautes, l\'impératrice Eugénie 62… et l\'ambassadeur d\'Autriche seulement 3.',
  'Molière a fait des études de droit et obtenu sa licence à Orléans. Il a renoncé à devenir avocat pour fonder une troupe de théâtre.',
  'Alexandre Dumas père n\'a quasiment pas été à l\'école. Clerc de notaire à l\'adolescence, il s\'est formé seul en dévorant les livres.',
  'Agatha Christie a appris à lire toute seule à 5 ans, contre l\'avis de sa mère qui voulait attendre ses 8 ans. Elle n\'a presque jamais fréquenté l\'école.',
  'Winston Churchill a dû s\'y reprendre à trois fois pour être admis à l\'académie militaire de Sandhurst. Ses professeurs le considéraient comme un élève médiocre.',
  'André Breton, le père du surréalisme, a commencé des études de médecine. C\'est en tant qu\'infirmier psychiatrique pendant la guerre de 14-18 qu\'il a découvert l\'inconscient et Freud.',
  'George Sand a été éduquée par un précepteur qui lui enseignait le latin, la botanique et les maths — des matières alors réservées aux garçons.',
  'En 2024, une élève française a obtenu le baccalauréat à l\'âge de 9 ans, en spécialités maths et physique-chimie. Le précédent record datait de 1989.',
  'La même année que la dictée de Mérimée (1857), une circulaire ministérielle a imposé la dictée hebdomadaire à tous les écoliers de France.',
  'Le Collège de Clermont, où Molière et Voltaire ont étudié, s\'appelle aujourd\'hui le lycée Louis-le-Grand — l\'un des plus prestigieux de France.',
]

export default function ConfigurerPage () {
  const params = useParams()
  const router = useRouter()
  const controleId = params.id as string

  const [controle, setControle] = useState<Controle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingMessage, setGeneratingMessage] = useState('')
  const [currentAnecdote, setCurrentAnecdote] = useState(0)
  const anecdoteRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [reuploadTarget, setReuploadTarget] = useState<'enonce' | 'corrige' | null>(null)
  const [transcribingEnonce, setTranscribingEnonce] = useState(false)
  const [transcribingCorrige, setTranscribingCorrige] = useState(false)

  // Load contrôle
  useEffect(() => {
    getControle(controleId).then((c) => {
      if (!c) {
        toast.error('Contrôle introuvable')
        router.push('/controles')
        return
      }
      setControle(c)
      setIsLoading(false)
    })
  }, [controleId, router])

  const update = useCallback((updates: Partial<Controle>) => {
    setControle((prev) => prev ? { ...prev, ...updates } : prev)
  }, [])

  const handleReupload = useCallback((target: 'enonce' | 'corrige') => {
    if (target === 'enonce') {
      // Réinitialiser l'énoncé + barème + transcription énoncé (le barème en dépend)
      update({ enonce_images: [], enonce_text: null, bareme: null })
      toast.success('Énoncé réinitialisé', { description: 'Uploadez les nouvelles images et régénérez le barème.' })
    } else {
      // Réinitialiser le corrigé uniquement (le barème peut rester, il sera régénéré si besoin)
      update({ corrige_images: [], corrige_text: null })
      toast.success('Corrigé réinitialisé', { description: 'Uploadez les nouvelles images.' })
    }
    setReuploadTarget(null)
  }, [update])

  const transcribeDoc = useCallback(async (target: 'enonce' | 'corrige') => {
    if (!controle) return
    const images = target === 'enonce' ? controle.enonce_images : controle.corrige_images
    if (images.length === 0) return

    const setLoading = target === 'enonce' ? setTranscribingEnonce : setTranscribingCorrige
    setLoading(true)
    try {
      const res = await fetch('/api/transcribe-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur de transcription')

      const textField = target === 'enonce' ? 'enonce_text' : 'corrige_text'
      update({ [textField]: result.text })
      toast.success('Transcription terminée', { description: 'Relisez et ajustez si nécessaire.' })
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error('Échec de la transcription', { description: msg })
    } finally {
      setLoading(false)
    }
  }, [controle, update])

  const handleSave = useCallback(async () => {
    if (!controle) return

    if (!controle.classe.trim()) {
      toast.error('Champ manquant', { description: 'Indiquez la classe.' })
      return
    }
    if (controle.enonce_images.length === 0) {
      toast.error('Énoncé requis', { description: 'Ajoutez au moins une image de l\'énoncé.' })
      return
    }

    setIsSaving(true)
    try {
      const nom = controle.nom.trim() || `Contrôle de ${MATIERES.find((m) => m.value === controle.matiere)?.label ?? controle.matiere}`
      await saveControle({ ...controle, nom })
      toast.success('Contrôle enregistré')
      router.push(`/controles/${controle.id}`)
    } catch (err) {
      console.error(err)
      toast.error('Erreur de sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }, [controle, router])

  // ─── Barème generation (SSE) ─────────────────────────────
  const generateBareme = useCallback(async () => {
    if (!controle) return

    setIsGenerating(true)
    setGeneratingMessage('Préparation…')
    setCurrentAnecdote(Math.floor(Math.random() * ANECDOTES.length))

    // Rotation des anecdotes toutes les 30 secondes
    anecdoteRef.current = setInterval(() => {
      setCurrentAnecdote((prev) => (prev + 1) % ANECDOTES.length)
    }, 30000)

    try {
      const res = await fetch('/api/generate-bareme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: controle.modele_bareme,
          matiere: controle.matiere,
          classe: controle.classe,
          enonceImages: [],
          corrigeImages: [],
          enonceText: controle.enonce_text ?? undefined,
          corrigeText: controle.corrige_text ?? undefined,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errorData.error || `Erreur HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('Pas de flux de réponse')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parser les événements SSE dans le buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Garder la dernière ligne incomplète

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))

              if (eventType === 'step') {
                setGeneratingMessage(data.message)
              } else if (eventType === 'result') {
                update({
                  bareme: data.bareme,
                  enonce_text: data.enonceText ?? controle.enonce_text,
                  corrige_text: data.corrigeText ?? controle.corrige_text,
                })
                toast.success('Barème prêt', { description: 'Vous pouvez l\'ajuster avant de continuer.' })
              } else if (eventType === 'error') {
                throw new Error(data.error)
              }
            } catch (parseErr) {
              if (eventType === 'error') throw parseErr
            }
            eventType = ''
          }
        }
      }
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error('Échec de la génération', { description: msg })
    } finally {
      if (anecdoteRef.current) clearInterval(anecdoteRef.current)
      setIsGenerating(false)
      setGeneratingMessage('')
    }
  }, [controle, update])

  // ─── Barème handlers ───────────────────────────────────
  const sections = useMemo(() => controle?.bareme?.questions ?? [], [controle?.bareme])

  const recalcAndUpdate = useCallback((newSections: BaremeQuestion[]) => {
    const total = newSections.reduce((sum, s) => sum + s.points, 0)
    update({ bareme: { total, questions: newSections } })
  }, [update])

  const recalcSection = useCallback((section: BaremeQuestion): BaremeQuestion => {
    const points = (section.criteres ?? []).reduce((sum, c) => sum + (c.points || 0), 0)
    return { ...section, points }
  }, [])

  const updateSectionTitre = useCallback((sectionId: string, titre: string) => {
    recalcAndUpdate(sections.map((s) => s.id === sectionId ? { ...s, titre } : s))
  }, [sections, recalcAndUpdate])

  const addSection = useCallback(() => {
    const newSection: BaremeQuestion = {
      id: String(sections.length + 1),
      titre: 'Nouvelle section',
      points: 2,
      criteres: [{ question: '', description: 'Critère à définir', points: 2 }],
    }
    recalcAndUpdate([...sections, newSection])
  }, [sections, recalcAndUpdate])

  const removeSection = useCallback((sectionId: string) => {
    recalcAndUpdate(sections.filter((s) => s.id !== sectionId))
  }, [sections, recalcAndUpdate])

  const updateCritere = useCallback((sectionId: string, critereIndex: number, updates: Partial<BaremeCritere>) => {
    const newSections = sections.map((s) => {
      if (s.id !== sectionId) return s
      const newCriteres = (s.criteres ?? []).map((c, i) => i === critereIndex ? { ...c, ...updates } : c)
      return recalcSection({ ...s, criteres: newCriteres })
    })
    recalcAndUpdate(newSections)
  }, [sections, recalcAndUpdate, recalcSection])

  const addCritere = useCallback((sectionId: string) => {
    const newSections = sections.map((s) => {
      if (s.id !== sectionId) return s
      const newCriteres = [...(s.criteres ?? []), { question: '', description: 'Nouveau critère', points: 1 }]
      return recalcSection({ ...s, criteres: newCriteres })
    })
    recalcAndUpdate(newSections)
  }, [sections, recalcAndUpdate, recalcSection])

  const removeCritere = useCallback((sectionId: string, critereIndex: number) => {
    const newSections = sections.map((s) => {
      if (s.id !== sectionId) return s
      const newCriteres = (s.criteres ?? []).filter((_, i) => i !== critereIndex)
      return recalcSection({ ...s, criteres: newCriteres })
    })
    recalcAndUpdate(newSections)
  }, [sections, recalcAndUpdate, recalcSection])

  if (isLoading || !controle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond-page">
        <div className="h-10 w-10 border-3 border-bleu-france border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-fond-page">
      {/* Header */}
      <header className="bg-fond-card border-b border-bordure sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/controles"
                className="h-9 w-9 rounded-lg bg-fond-alt flex items-center justify-center hover:bg-bleu-france-light transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-texte-secondaire" />
              </Link>
              <div>
                <h1 className="text-base font-bold text-texte-primaire">
                  Configurer le contrôle
                </h1>
                <p className="text-xs text-texte-secondaire">
                  {controle.nom || 'Nouveau contrôle'}
                </p>
              </div>
            </div>
            <Button onClick={handleSave} isLoading={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              Enregistrer et continuer
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Section 1 : Documents */}
        <Card>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-bleu-france" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-texte-primaire">Documents du contrôle</h3>
                <p className="text-sm text-texte-secondaire">Ajoutez l&apos;énoncé et le corrigé (optionnel)</p>
              </div>
            </div>

            {/* Énoncé */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-texte-primaire">Énoncé du contrôle</p>
              {!controle.enonce_text ? (
                /* Pas encore transcrit → upload + bouton transcrire */
                <div className="space-y-3">
                  <FileUpload
                    label=""
                    hint="Images ou PDF de l'énoncé. Formats acceptés : JPG, PNG, PDF"
                    files={controle.enonce_images}
                    onFilesChange={(files) => update({ enonce_images: files })}
                    processFiles={(files) => processFiles(files)}
                  />
                  {controle.enonce_images.length > 0 && (
                    <Button
                      onClick={() => transcribeDoc('enonce')}
                      isLoading={transcribingEnonce}
                      className="gap-2 w-full"
                    >
                      {!transcribingEnonce && <FileText className="h-4 w-4" />}
                      {transcribingEnonce ? 'Transcription en cours...' : 'Transcrire l\'énoncé'}
                    </Button>
                  )}
                </div>
              ) : (
                /* Transcription faite → side-by-side */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-texte-secondaire mb-2">Images originales</p>
                      <ImageViewer images={controle.enonce_images} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-texte-secondaire mb-2">Transcription</p>
                      <MarkdownEditor
                        value={controle.enonce_text}
                        onChange={(value) => update({ enonce_text: value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReuploadTarget('enonce')}
                      className="gap-2"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Modifier l&apos;énoncé
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Corrigé */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-texte-primaire">Corrigé (optionnel)</p>
              {!controle.corrige_text ? (
                /* Pas encore transcrit → upload + bouton transcrire */
                <div className="space-y-3">
                  <FileUpload
                    label=""
                    hint="Le corrigé type du contrôle, si disponible"
                    files={controle.corrige_images}
                    onFilesChange={(files) => update({ corrige_images: files })}
                    processFiles={(files) => processFiles(files)}
                  />
                  {controle.corrige_images.length > 0 && (
                    <Button
                      onClick={() => transcribeDoc('corrige')}
                      isLoading={transcribingCorrige}
                      className="gap-2 w-full"
                    >
                      {!transcribingCorrige && <FileText className="h-4 w-4" />}
                      {transcribingCorrige ? 'Transcription en cours...' : 'Transcrire le corrigé'}
                    </Button>
                  )}
                </div>
              ) : (
                /* Transcription faite → side-by-side */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-texte-secondaire mb-2">Images originales</p>
                      <ImageViewer images={controle.corrige_images} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-texte-secondaire mb-2">Transcription</p>
                      <MarkdownEditor
                        value={controle.corrige_text}
                        onChange={(value) => update({ corrige_text: value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReuploadTarget('corrige')}
                      className="gap-2"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Modifier le corrigé
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2 : Paramètres */}
        <Card>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                <Settings className="h-5 w-5 text-bleu-france" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-texte-primaire">Paramètres</h3>
                <p className="text-sm text-texte-secondaire">Configurez le contexte du contrôle</p>
              </div>
            </div>

            <Input
              label="Nom du contrôle (optionnel)"
              placeholder="Ex : Contrôle sur la Révolution française"
              value={controle.nom}
              onChange={(e) => update({ nom: e.target.value })}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input
                label="Classe"
                placeholder="Ex : 3ème B, 1ère S2..."
                value={controle.classe}
                onChange={(e) => update({ classe: e.target.value })}
              />
              <Select
                label="Matière"
                value={controle.matiere}
                onChange={(e) => update({ matiere: e.target.value })}
                options={MATIERES}
              />
            </div>

            <SeverityToggle
              value={controle.severite}
              onChange={(severite: Severite) => update({ severite })}
            />

            <Select
              label="Modèle pour le barème"
              hint="IA utilisée pour générer le barème à partir de l'énoncé"
              value={controle.modele_bareme}
              onChange={(e) => update({ modele_bareme: e.target.value })}
              options={CORRECTION_MODELS.map((m) => ({
                value: m.id,
                label: m.label,
              }))}
            />
          </CardContent>
        </Card>

        {/* Section 3 : Barème */}
        <div className="space-y-4">
          {/* Generate button (si pas de barème) */}
          {!controle.bareme && !isGenerating && (
            <Card>
              <CardContent className="py-10 flex flex-col items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-bleu-france-light flex items-center justify-center">
                  <ClipboardList className="h-7 w-7 text-bleu-france" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-texte-primaire">Générer le barème</h3>
                  <p className="text-sm text-texte-secondaire mt-1">
                    L&apos;IA analysera l&apos;énoncé pour proposer un barème détaillé
                  </p>
                </div>
                <Button
                  onClick={generateBareme}
                  size="lg"
                  className="gap-2"
                  disabled={!controle.enonce_text || transcribingEnonce || transcribingCorrige}
                >
                  <Sparkles className="h-4 w-4" />
                  Générer le barème
                </Button>
                {!controle.enonce_text && controle.enonce_images.length > 0 && (
                  <p className="text-xs text-amber-600">Transcrivez d&apos;abord l&apos;énoncé avant de générer le barème</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Loading avec anecdotes */}
          {isGenerating && (
            <Card>
              <CardContent className="py-10">
                <div className="flex flex-col items-center gap-6">
                  {/* Spinner + message serveur */}
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 border-3 border-bleu-france-light rounded-full animate-spin border-t-bleu-france flex-shrink-0" />
                    <p className="text-sm font-medium text-texte-primaire">{generatingMessage}</p>
                  </div>

                  {/* Anecdote rotative */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentAnecdote}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4 }}
                      className="max-w-md text-center"
                    >
                      <p className="text-xs font-medium text-bleu-france mb-1.5">Le saviez-vous ?</p>
                      <p className="text-sm text-texte-secondaire leading-relaxed italic">
                        {ANECDOTES[currentAnecdote]}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Barème editor */}
          <AnimatePresence>
            {controle.bareme && !isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Header with total */}
                <Card>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                          <ClipboardList className="h-5 w-5 text-bleu-france" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-texte-primaire">Barème</h3>
                          <p className="text-sm text-texte-secondaire">
                            {sections.length} section{sections.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-bleu-france">{controle.bareme?.total ?? 0}</p>
                        <p className="text-xs text-texte-secondaire">points</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Sections */}
                {sections.map((section, sIndex) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={sIndex}
                    onUpdateTitre={(titre) => updateSectionTitre(section.id, titre)}
                    onUpdateCritere={(ci, updates) => updateCritere(section.id, ci, updates)}
                    onAddCritere={() => addCritere(section.id)}
                    onRemoveCritere={(ci) => removeCritere(section.id, ci)}
                    onRemoveSection={() => removeSection(section.id)}
                  />
                ))}

                {/* Add section */}
                <button
                  type="button"
                  onClick={addSection}
                  className="w-full border-2 border-dashed border-bordure rounded-xl p-4 text-sm text-texte-secondaire hover:border-bleu-france hover:text-bleu-france hover:bg-bleu-france-light/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une section
                </button>

                {/* Regenerate */}
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={generateBareme} isLoading={isGenerating} disabled={!controle.enonce_text || transcribingEnonce || transcribingCorrige} size="sm" className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Régénérer le barème
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom actions */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => router.push('/controles')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <Button onClick={handleSave} isLoading={isSaving} size="lg" className="gap-2">
            <Save className="h-4 w-4" />
            Enregistrer et continuer
          </Button>
        </div>
      </div>

      {/* Reupload confirmation dialog */}
      <ConfirmDialog
        open={reuploadTarget !== null}
        onOpenChange={(open) => { if (!open) setReuploadTarget(null) }}
        title={reuploadTarget === 'enonce' ? 'Modifier l\'énoncé ?' : 'Modifier le corrigé ?'}
        description={
          reuploadTarget === 'enonce'
            ? 'Les images et la transcription de l\'énoncé seront supprimées. Le barème devra être régénéré.'
            : 'Les images et la transcription du corrigé seront supprimées. Vous pourrez en uploader de nouvelles.'
        }
        confirmLabel={reuploadTarget === 'enonce' ? 'Modifier l\'énoncé' : 'Modifier le corrigé'}
        onConfirm={() => { if (reuploadTarget) handleReupload(reuploadTarget) }}
      />
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────

interface SectionCardProps {
  section: BaremeQuestion
  index: number
  onUpdateTitre: (titre: string) => void
  onUpdateCritere: (critereIndex: number, updates: Partial<BaremeCritere>) => void
  onAddCritere: () => void
  onRemoveCritere: (critereIndex: number) => void
  onRemoveSection: () => void
}

function SectionCard ({
  section,
  index,
  onUpdateTitre,
  onUpdateCritere,
  onAddCritere,
  onRemoveCritere,
  onRemoveSection,
}: SectionCardProps) {
  const criteres = section.criteres ?? []
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!cardRef.current) return
    const textareas = cardRef.current.querySelectorAll('textarea')
    textareas.forEach((ta) => {
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    })
  }, [criteres, section.titre])

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card>
        <CardContent className="space-y-4">
          <div ref={cardRef}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <textarea
                  value={section.titre ?? ''}
                  onChange={(e) => onUpdateTitre(e.target.value)}
                  placeholder="Titre de la section"
                  className="w-full px-3 py-2.5 text-base font-semibold text-texte-primaire border border-bordure rounded-lg bg-fond-card focus:outline-none focus:ring-2 focus:ring-bleu-france resize-none overflow-hidden leading-relaxed"
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = target.scrollHeight + 'px'
                  }}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="text-right">
                  <p className="text-xl font-bold text-bleu-france">{section.points}</p>
                  <p className="text-xs text-texte-secondaire">pts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="p-2 text-texte-disabled hover:text-error hover:bg-error-light rounded-lg transition-all cursor-pointer"
                  title="Supprimer cette section"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border border-bordure rounded-lg mt-4">
              <table className="w-full border-collapse text-sm table-fixed">
                <thead>
                  <tr className="bg-fond-alt">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-texte-secondaire uppercase tracking-wide border-b border-bordure">
                      Critères d&apos;évaluation
                    </th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-texte-secondaire uppercase tracking-wide border-b border-bordure" style={{ width: '70px' }}>
                      Points
                    </th>
                    <th className="px-2 py-2.5 border-b border-bordure" style={{ width: '36px' }} />
                  </tr>
                </thead>
                <tbody>
                  {criteres.map((critere, cIndex) => (
                    <tr key={cIndex} className="border-b border-bordure last:border-b-0 hover:bg-fond-alt/30 transition-colors">
                      <td className="px-1 py-1">
                        <textarea
                          value={critere.description ?? ''}
                          onChange={(e) => onUpdateCritere(cIndex, { description: e.target.value })}
                          placeholder="Description du critère"
                          rows={1}
                          className="w-full px-2 py-1.5 text-sm bg-transparent border border-transparent rounded hover:border-bordure focus:border-bleu-france focus:outline-none transition-colors resize-none break-words overflow-hidden"
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = 'auto'
                            target.style.height = target.scrollHeight + 'px'
                          }}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={critere.points ?? 0}
                          onChange={(e) => onUpdateCritere(cIndex, { points: Number(e.target.value) })}
                          className="w-full px-2 py-1.5 text-sm text-center font-bold text-bleu-france bg-transparent border border-transparent rounded hover:border-bordure focus:border-bleu-france focus:outline-none transition-colors"
                          min={0}
                          step={0.5}
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {criteres.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onRemoveCritere(cIndex)}
                            className="p-1 text-texte-disabled hover:text-error transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-fond-alt/50">
                    <td colSpan={3} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={onAddCritere}
                        className="flex items-center gap-1.5 text-xs text-bleu-france hover:text-bleu-france-hover transition-colors cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        Ajouter un critère
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={isConfirmingDelete}
        onOpenChange={setIsConfirmingDelete}
        title="Supprimer cette section ?"
        description={`La section « ${section.titre || 'Sans titre'} » et ses ${criteres.length} critère${criteres.length > 1 ? 's' : ''} seront supprimés du barème.`}
        confirmLabel="Supprimer la section"
        onConfirm={() => {
          onRemoveSection()
          setIsConfirmingDelete(false)
        }}
      />
    </motion.div>
  )
}
