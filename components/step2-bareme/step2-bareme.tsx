'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ControlData, BaremeQuestion, BaremeCritere } from '@/lib/types'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Sparkles,
  ClipboardList,
} from 'lucide-react'

interface Step2BaremeProps {
  data: ControlData
  onUpdate: (updates: Partial<ControlData>) => void
  onNext: () => void
  onPrev: () => void
}

const LOADING_STEPS = [
  { key: 'enonce', label: 'Lecture de l\'énoncé' },
  { key: 'corrige', label: 'Analyse du corrigé' },
  { key: 'generation', label: 'Création du barème' },
]

export function Step2Bareme ({ data, onUpdate, onNext, onPrev }: Step2BaremeProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(!!data.bareme)
  const [loadingStep, setLoadingStep] = useState(0)
  const hasAutoTriggered = useRef(false)

  const generateBareme = useCallback(async () => {
    setIsGenerating(true)
    setLoadingStep(0)

    try {
      // Étape 1 : Lecture de l'énoncé
      setLoadingStep(0)
      await new Promise((r) => setTimeout(r, 600))

      // Étape 2 : Analyse du corrigé (si fourni)
      if (data.corrige_images.length > 0) {
        setLoadingStep(1)
        await new Promise((r) => setTimeout(r, 500))
      }

      // Étape 3 : Création du barème
      setLoadingStep(2)

      const res = await fetch('/api/generate-bareme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: data.modele_correction,
          matiere: data.matiere,
          classe: data.classe,
          enonceImages: data.enonce_images,
          corrigeImages: data.corrige_images,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur lors de la génération')
      }

      onUpdate({ bareme: result.bareme })
      setHasGenerated(true)
      toast.success('Barème prêt', {
        description: 'Le barème a été généré. Vous pouvez l\'ajuster avant de continuer.',
      })
    } catch (err) {
      console.error('Erreur:', err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error('Échec de la génération', {
        description: `Le barème n'a pas pu être créé : ${msg}`,
      })
    } finally {
      setIsGenerating(false)
      setLoadingStep(0)
    }
  }, [data, onUpdate])

  // Auto-lancer la génération au montage si pas de barème
  useEffect(() => {
    if (!hasAutoTriggered.current && !data.bareme && data.enonce_images.length > 0) {
      hasAutoTriggered.current = true
      generateBareme()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Accès sécurisé
  const sections = useMemo(() => data.bareme?.questions ?? [], [data.bareme])

  // Recalcule le total global et met à jour
  const recalcAndUpdate = useCallback((newSections: BaremeQuestion[]) => {
    const total = newSections.reduce((sum, s) => sum + s.points, 0)
    onUpdate({ bareme: { total, questions: newSections } })
  }, [onUpdate])

  // Recalcule les points d'une section depuis ses critères
  const recalcSection = useCallback((section: BaremeQuestion): BaremeQuestion => {
    const points = (section.criteres ?? []).reduce((sum, c) => sum + (c.points || 0), 0)
    return { ...section, points }
  }, [])

  // ─── Section handlers ──────────────────────────────────
  const updateSectionTitre = useCallback((sectionId: string, titre: string) => {
    const newSections = sections.map((s) =>
      s.id === sectionId ? { ...s, titre } : s
    )
    recalcAndUpdate(newSections)
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

  // ─── Critère handlers ──────────────────────────────────
  const updateCritere = useCallback((sectionId: string, critereIndex: number, updates: Partial<BaremeCritere>) => {
    const newSections = sections.map((s) => {
      if (s.id !== sectionId) return s
      const newCriteres = (s.criteres ?? []).map((c, i) =>
        i === critereIndex ? { ...c, ...updates } : c
      )
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

  const handleValidate = useCallback(() => {
    if (!data.bareme || sections.length === 0) {
      toast.error('Barème manquant', {
        description: 'Veuillez générer ou configurer un barème avant de continuer.',
      })
      return
    }
    onNext()
  }, [data.bareme, sections, onNext])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Loading avec étapes */}
      {isGenerating && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="h-14 w-14 border-4 border-bleu-france-light rounded-full animate-spin border-t-bleu-france" />
              </div>
              <div className="w-full max-w-xs space-y-3">
                {LOADING_STEPS
                  .filter((_, i) => i !== 1 || data.corrige_images.length > 0)
                  .map((step, i) => {
                    const stepIndex = LOADING_STEPS.indexOf(step)
                    const isActive = loadingStep === stepIndex
                    const isDone = loadingStep > stepIndex

                    return (
                      <div key={step.key} className="flex items-center gap-3">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                          isDone
                            ? 'bg-bleu-france text-white'
                            : isActive
                              ? 'border-2 border-bleu-france bg-bleu-france-light'
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

      {/* Éditeur de barème */}
      <AnimatePresence>
        {data.bareme && hasGenerated && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* En-tête avec total */}
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
                    <p className="text-3xl font-bold text-bleu-france">
                      {data.bareme?.total ?? 0}
                    </p>
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

            {/* Ajouter une section */}
            <button
              type="button"
              onClick={addSection}
              className="w-full border-2 border-dashed border-bordure rounded-xl p-4 text-sm text-texte-secondaire hover:border-bleu-france hover:text-bleu-france hover:bg-bleu-france-light/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Ajouter une section
            </button>

            {/* Régénérer */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={generateBareme}
                isLoading={isGenerating}
                size="sm"
                className="gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Régénérer le barème
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        <Button onClick={handleValidate} size="lg" className="gap-2" disabled={!data.bareme}>
          Passer aux copies
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Sous-composant : carte de section avec tableau ──────

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

  // Auto-détection : afficher la colonne "Question" si au moins un critère a une ref
  const hasQuestionColumn = useMemo(
    () => criteres.some((c) => typeof c.question === 'string' && c.question.trim() !== ''),
    [criteres]
  )

  const colCount = hasQuestionColumn ? 4 : 3

  // Auto-resize de tous les textareas au montage / changement
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
          {/* En-tête de section : titre agrandi + supprimer */}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <textarea
                value={section.titre ?? ''}
                onChange={(e) => onUpdateTitre(e.target.value)}
                placeholder="Titre de la section (ex : Partie A - Texte littéraire)"
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

          {/* Tableau des critères */}
          <div className="border border-bordure rounded-lg">
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
                  <tr
                    key={cIndex}
                    className="border-b border-bordure last:border-b-0 hover:bg-fond-alt/30 transition-colors"
                  >
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
