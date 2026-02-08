'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ControlData, Bareme, BaremeQuestion } from '@/lib/types'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Sparkles,
  GripVertical,
  ClipboardList,
} from 'lucide-react'

interface Step2BaremeProps {
  data: ControlData
  onUpdate: (updates: Partial<ControlData>) => void
  onNext: () => void
  onPrev: () => void
}

export function Step2Bareme ({ data, onUpdate, onNext, onPrev }: Step2BaremeProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(!!data.bareme)

  const generateBareme = useCallback(async () => {
    setIsGenerating(true)
    try {
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
        throw new Error(result.error || 'Erreur lors de la generation')
      }

      onUpdate({ bareme: result.bareme })
      setHasGenerated(true)
      toast.success('Barème généré avec succès')
    } catch (err) {
      console.error('Erreur:', err)
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la génération du barème')
    } finally {
      setIsGenerating(false)
    }
  }, [data, onUpdate])

  // Accès sécurisé aux questions du barème
  const baremeQuestions = data.bareme?.questions ?? []

  const updateQuestion = useCallback((questionId: string, updates: Partial<BaremeQuestion>) => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestions = questions.map((q) =>
      q.id === questionId ? { ...q, ...updates } : q
    )
    const total = newQuestions.reduce((sum, q) => sum + (q.points || 0), 0)
    onUpdate({
      bareme: { ...data.bareme, questions: newQuestions, total },
    })
  }, [data.bareme, onUpdate])

  const addQuestion = useCallback(() => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestion: BaremeQuestion = {
      id: String(questions.length + 1),
      titre: `Question ${questions.length + 1}`,
      points: 2,
      criteres: ['Critère à définir'],
    }
    const newQuestions = [...questions, newQuestion]
    const total = newQuestions.reduce((sum, q) => sum + (q.points || 0), 0)
    onUpdate({
      bareme: { ...data.bareme, questions: newQuestions, total },
    })
  }, [data.bareme, onUpdate])

  const removeQuestion = useCallback((questionId: string) => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestions = questions.filter((q) => q.id !== questionId)
    const total = newQuestions.reduce((sum, q) => sum + (q.points || 0), 0)
    onUpdate({
      bareme: { ...data.bareme, questions: newQuestions, total },
    })
  }, [data.bareme, onUpdate])

  const updateCritere = useCallback((questionId: string, critereIndex: number, value: string) => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestions = questions.map((q) => {
      if (q.id !== questionId) return q
      const newCriteres = [...(q.criteres ?? [])]
      newCriteres[critereIndex] = value
      return { ...q, criteres: newCriteres }
    })
    onUpdate({ bareme: { ...data.bareme, questions: newQuestions } })
  }, [data.bareme, onUpdate])

  const addCritere = useCallback((questionId: string) => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestions = questions.map((q) => {
      if (q.id !== questionId) return q
      return { ...q, criteres: [...(q.criteres ?? []), 'Nouveau critère'] }
    })
    onUpdate({ bareme: { ...data.bareme, questions: newQuestions } })
  }, [data.bareme, onUpdate])

  const removeCritere = useCallback((questionId: string, critereIndex: number) => {
    if (!data.bareme) return
    const questions = data.bareme.questions ?? []
    const newQuestions = questions.map((q) => {
      if (q.id !== questionId) return q
      return { ...q, criteres: (q.criteres ?? []).filter((_, i) => i !== critereIndex) }
    })
    onUpdate({ bareme: { ...data.bareme, questions: newQuestions } })
  }, [data.bareme, onUpdate])

  const handleValidate = useCallback(() => {
    if (!data.bareme || (data.bareme.questions ?? []).length === 0) {
      toast.error('Veuillez générer ou configurer un barème')
      return
    }
    onNext()
  }, [data.bareme, onNext])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Generate button */}
      {!hasGenerated && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-6">
            <div className="h-16 w-16 rounded-2xl bg-bleu-france-light flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-bleu-france" />
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-xl font-bold text-texte-primaire mb-2">
                Génération du barème
              </h3>
              <p className="text-sm text-texte-secondaire">
                L&apos;IA va analyser l&apos;énoncé{data.corrige_images.length > 0 ? ' et le corrigé' : ''} pour proposer un barème détaillé et adapté.
              </p>
            </div>
            <Button
              onClick={generateBareme}
              isLoading={isGenerating}
              size="lg"
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Générer le barème
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isGenerating && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 border-4 border-bleu-france-light rounded-full animate-spin border-t-bleu-france" />
              </div>
              <p className="text-sm text-texte-secondaire animate-pulse">
                Analyse de l&apos;énoncé en cours...
              </p>
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
                        {baremeQuestions.length} questions
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

            {/* Questions */}
            {baremeQuestions.map((question, qIndex) => (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: qIndex * 0.05 }}
              >
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <GripVertical className="h-5 w-5 text-texte-disabled mt-2 flex-shrink-0" />

                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <Input
                            value={question.titre}
                            onChange={(e) => updateQuestion(question.id, { titre: e.target.value })}
                            className="flex-1 font-medium"
                          />
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <input
                              type="number"
                              value={question.points}
                              onChange={(e) => updateQuestion(question.id, { points: Number(e.target.value) })}
                              className="w-16 px-2 py-2.5 border border-bordure rounded-lg text-sm text-center font-bold text-bleu-france focus:outline-none focus:ring-2 focus:ring-bleu-france"
                              min={0}
                              step={0.5}
                            />
                            <span className="text-xs text-texte-secondaire">pts</span>
                          </div>
                        </div>

                        {/* Critères */}
                        <div className="space-y-2 pl-1">
                          <p className="text-xs font-medium text-texte-secondaire uppercase tracking-wide">
                            Critères d&apos;évaluation
                          </p>
                          {(question.criteres ?? []).map((critere, cIndex) => (
                            <div key={cIndex} className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-bleu-france flex-shrink-0" />
                              <input
                                type="text"
                                value={critere}
                                onChange={(e) => updateCritere(question.id, cIndex, e.target.value)}
                                className="flex-1 px-2 py-1.5 text-sm border-b border-transparent hover:border-bordure focus:border-bleu-france focus:outline-none transition-colors bg-transparent"
                              />
                              {(question.criteres ?? []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeCritere(question.id, cIndex)}
                                  className="p-1 text-texte-disabled hover:text-error transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addCritere(question.id)}
                            className="flex items-center gap-1.5 text-xs text-bleu-france hover:text-bleu-france-hover transition-colors mt-1 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            Ajouter un critère
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeQuestion(question.id)}
                        className="p-2 text-texte-disabled hover:text-error hover:bg-error-light rounded-lg transition-all cursor-pointer"
                        title="Supprimer cette question"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Add question */}
            <button
              type="button"
              onClick={addQuestion}
              className="w-full border-2 border-dashed border-bordure rounded-xl p-4 text-sm text-texte-secondaire hover:border-bleu-france hover:text-bleu-france hover:bg-bleu-france-light/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Ajouter une question
            </button>

            {/* Regenerate button */}
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
