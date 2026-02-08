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
} from 'lucide-react'
import Link from 'next/link'

const LOADING_STEPS = [
  { key: 'enonce', label: 'Lecture de l\'énoncé' },
  { key: 'corrige', label: 'Analyse du corrigé' },
  { key: 'generation', label: 'Création du barème' },
]

export default function ConfigurerPage () {
  const params = useParams()
  const router = useRouter()
  const controleId = params.id as string

  const [controle, setControle] = useState<Controle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)

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

  // ─── Barème generation ─────────────────────────────────
  const generateBareme = useCallback(async () => {
    if (!controle) return

    setIsGenerating(true)
    setLoadingStep(0)

    try {
      setLoadingStep(0)
      await new Promise((r) => setTimeout(r, 600))

      if (controle.corrige_images.length > 0) {
        setLoadingStep(1)
        await new Promise((r) => setTimeout(r, 500))
      }

      setLoadingStep(2)

      const res = await fetch('/api/generate-bareme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: controle.modele_bareme,
          matiere: controle.matiere,
          classe: controle.classe,
          enonceImages: controle.enonce_images,
          corrigeImages: controle.corrige_images,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur lors de la génération')

      update({
        bareme: result.bareme,
        enonce_text: result.enonceText ?? null,
        corrige_text: result.corrigeText ?? null,
      })
      toast.success('Barème prêt', { description: 'Vous pouvez l\'ajuster avant de continuer.' })
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error('Échec de la génération', { description: msg })
    } finally {
      setIsGenerating(false)
      setLoadingStep(0)
    }
  }, [controle, update])

  // Auto-generate on mount if no barème but has images
  const hasAutoTriggered = useRef(false)
  useEffect(() => {
    if (!controle || hasAutoTriggered.current) return
    if (!controle.bareme && controle.enonce_images.length > 0 && controle.classe.trim()) {
      hasAutoTriggered.current = true
      generateBareme()
    }
  }, [controle]) // eslint-disable-line react-hooks/exhaustive-deps

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

            <FileUpload
              label="Énoncé du contrôle"
              hint="Images ou PDF de l'énoncé. Formats acceptés : JPG, PNG, PDF"
              files={controle.enonce_images}
              onFilesChange={(files) => update({ enonce_images: files })}
              processFiles={(files) => processFiles(files)}
            />

            <FileUpload
              label="Corrigé (optionnel)"
              hint="Le corrigé type du contrôle, si disponible"
              files={controle.corrige_images}
              onFilesChange={(files) => update({ corrige_images: files })}
              processFiles={(files) => processFiles(files)}
            />
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
                <p className="text-sm text-texte-secondaire">Configurez le contexte et le modèle IA</p>
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
                  disabled={controle.enonce_images.length === 0}
                >
                  <Sparkles className="h-4 w-4" />
                  Générer le barème
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading */}
          {isGenerating && (
            <Card>
              <CardContent className="py-10">
                <div className="flex flex-col items-center gap-6">
                  <div className="h-14 w-14 border-4 border-bleu-france-light rounded-full animate-spin border-t-bleu-france" />
                  <div className="w-full max-w-xs space-y-3">
                    {LOADING_STEPS
                      .filter((_, i) => i !== 1 || controle.corrige_images.length > 0)
                      .map((step, i) => {
                        const stepIndex = LOADING_STEPS.indexOf(step)
                        const isActive = loadingStep === stepIndex
                        const isDone = loadingStep > stepIndex
                        return (
                          <div key={step.key} className="flex items-center gap-3">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                              isDone ? 'bg-bleu-france text-white'
                                : isActive ? 'border-2 border-bleu-france bg-bleu-france-light'
                                  : 'border-2 border-bordure bg-fond-alt'
                            }`}>
                              {isDone ? (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className={`text-xs font-medium ${isActive ? 'text-bleu-france' : 'text-texte-disabled'}`}>{i + 1}</span>
                              )}
                            </div>
                            <span className={`text-sm transition-colors duration-300 ${
                              isActive ? 'text-texte-primaire font-medium' : isDone ? 'text-texte-secondaire' : 'text-texte-disabled'
                            }`}>
                              {step.label}{isActive ? '...' : ''}
                            </span>
                          </div>
                        )
                      })}
                  </div>
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
                  <Button variant="ghost" onClick={generateBareme} isLoading={isGenerating} size="sm" className="gap-2">
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

  const hasQuestionColumn = useMemo(
    () => criteres.some((c) => typeof c.question === 'string' && c.question.trim() !== ''),
    [criteres]
  )

  const colCount = hasQuestionColumn ? 4 : 3

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
                    {hasQuestionColumn && (
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-texte-secondaire uppercase tracking-wide border-b border-bordure" style={{ width: '90px' }}>
                        Question
                      </th>
                    )}
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
                      {hasQuestionColumn && (
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={critere.question ?? ''}
                            onChange={(e) => onUpdateCritere(cIndex, { question: e.target.value })}
                            placeholder="1)a)"
                            className="w-full px-2 py-1.5 text-sm text-center font-medium text-bleu-france bg-transparent border border-transparent rounded hover:border-bordure focus:border-bleu-france focus:outline-none transition-colors"
                          />
                        </td>
                      )}
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
                    <td colSpan={colCount} className="px-3 py-2">
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
