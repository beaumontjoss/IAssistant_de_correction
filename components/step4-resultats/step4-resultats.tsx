'use client'

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ControlData, CopieEleve, Correction } from '@/lib/types'
import { generateStudentPDF, generateSummaryPDF } from '@/lib/pdf-generator'
import {
  ArrowLeft,
  Download,
  FileDown,
  Award,
  BarChart3,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Sparkles,
} from 'lucide-react'

interface Step4ResultatsProps {
  data: ControlData
  onUpdate: (updates: Partial<ControlData>) => void
  onPrev: () => void
}

type SortKey = 'nom' | 'note'
type SortDir = 'asc' | 'desc'

export function Step4Resultats ({ data, onUpdate, onPrev }: Step4ResultatsProps) {
  const [correctingIds, setCorrectingIds] = useState<Set<string>>(new Set())
  const [expandedCopy, setExpandedCopy] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('nom')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const validatedCopies = useMemo(() =>
    data.copies.filter((c) => c.transcription_validee),
  [data.copies])

  const correctedCopies = useMemo(() =>
    validatedCopies.filter((c) => c.correction),
  [validatedCopies])

  const sortedCopies = useMemo(() => {
    const sorted = [...validatedCopies].sort((a, b) => {
      if (sortKey === 'nom') {
        return sortDir === 'asc'
          ? a.nom_eleve.localeCompare(b.nom_eleve)
          : b.nom_eleve.localeCompare(a.nom_eleve)
      }
      const noteA = a.correction?.note_globale ?? -1
      const noteB = b.correction?.note_globale ?? -1
      return sortDir === 'asc' ? noteA - noteB : noteB - noteA
    })
    return sorted
  }, [validatedCopies, sortKey, sortDir])

  const stats = useMemo(() => {
    const notes = correctedCopies.map((c) => c.correction!.note_globale)
    if (notes.length === 0) return null

    const total = correctedCopies[0]?.correction?.total || 20
    const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length
    const sortedNotes = [...notes].sort((a, b) => a - b)
    const mediane = sortedNotes.length % 2 === 0
      ? (sortedNotes[sortedNotes.length / 2 - 1] + sortedNotes[sortedNotes.length / 2]) / 2
      : sortedNotes[Math.floor(sortedNotes.length / 2)]
    const ecartType = Math.sqrt(
      notes.reduce((sum, n) => sum + Math.pow(n - moyenne, 2), 0) / notes.length
    )

    // Distribution histogram (5 buckets)
    const bucketSize = total / 5
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const min = i * bucketSize
      const max = (i + 1) * bucketSize
      const count = notes.filter((n) => n >= min && (i === 4 ? n <= max : n < max)).length
      return { min, max, count, label: `${min.toFixed(0)}-${max.toFixed(0)}` }
    })

    return {
      count: notes.length,
      total,
      moyenne,
      mediane,
      ecartType,
      min: Math.min(...notes),
      max: Math.max(...notes),
      distribution,
    }
  }, [correctedCopies])

  const correctCopy = useCallback(async (copy: CopieEleve) => {
    if (!copy.transcription_md || !data.bareme) return

    setCorrectingIds((prev) => new Set(prev).add(copy.id))

    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: data.modele_correction,
          matiere: data.matiere,
          classe: data.classe,
          severite: data.severite,
          baremeJson: JSON.stringify(data.bareme),
          mdCopie: copy.transcription_md,
          corrigeText: data.corrige_images.length > 0 ? '[Corrigé fourni]' : null,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur lors de la correction')
      }

      const newCopies = data.copies.map((c) =>
        c.id === copy.id ? { ...c, correction: result.correction as Correction } : c
      )
      onUpdate({ copies: newCopies })
      toast.success(`${copy.nom_eleve} — Corrigée`, {
        description: 'La correction est disponible. Vous pouvez la consulter et l\'ajuster.',
      })
    } catch (err) {
      console.error('Erreur correction:', err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      const isNetwork = msg.includes('fetch failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
      toast.error(isNetwork ? 'Problème de connexion' : 'Échec de la correction', {
        description: isNetwork
          ? 'Impossible de joindre le serveur. Vérifiez votre connexion internet et réessayez.'
          : msg,
      })
    } finally {
      setCorrectingIds((prev) => {
        const next = new Set(prev)
        next.delete(copy.id)
        return next
      })
    }
  }, [data, onUpdate])

  const correctAll = useCallback(async () => {
    const toCorrect = validatedCopies.filter((c) => !c.correction)
    for (const copy of toCorrect) {
      await correctCopy(copy)
    }
  }, [validatedCopies, correctCopy])

  const updateCopyCorrection = useCallback((copyId: string, updates: Partial<Correction>) => {
    const newCopies = data.copies.map((c) => {
      if (c.id !== copyId || !c.correction) return c
      return { ...c, correction: { ...c.correction, ...updates } }
    })
    onUpdate({ copies: newCopies })
  }, [data.copies, onUpdate])

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey])

  const allCorrected = correctedCopies.length === validatedCopies.length && validatedCopies.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Correct all button */}
      {!allCorrected && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-bleu-france-light flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-bleu-france" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-texte-primaire">
                Correction par l&apos;IA
              </h3>
              <p className="text-sm text-texte-secondaire mt-1">
                {validatedCopies.length - correctedCopies.length} copie{validatedCopies.length - correctedCopies.length > 1 ? 's' : ''} à corriger
              </p>
            </div>
            <Button
              onClick={correctAll}
              isLoading={correctingIds.size > 0}
              size="lg"
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Corriger toutes les copies
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      {stats && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-bleu-france" />
              </div>
              <h3 className="text-lg font-bold text-texte-primaire">Statistiques</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              {[
                { label: 'Copies', value: String(stats.count) },
                { label: 'Moyenne', value: `${stats.moyenne.toFixed(1)}/${stats.total}` },
                { label: 'Médiane', value: `${stats.mediane.toFixed(1)}/${stats.total}` },
                { label: 'Écart-type', value: stats.ecartType.toFixed(2) },
                { label: 'Note min', value: `${stats.min.toFixed(1)}/${stats.total}` },
                { label: 'Note max', value: `${stats.max.toFixed(1)}/${stats.total}` },
              ].map((stat) => (
                <div key={stat.label} className="bg-fond-alt rounded-xl p-3 text-center">
                  <p className="text-xs text-texte-secondaire">{stat.label}</p>
                  <p className="text-lg font-bold text-bleu-france mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Distribution histogram */}
            <div className="flex items-end gap-2 h-32">
              {stats.distribution.map((bucket) => {
                const maxCount = Math.max(...stats.distribution.map((b) => b.count), 1)
                const heightPercent = (bucket.count / maxCount) * 100

                return (
                  <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-texte-secondaire font-medium">
                      {bucket.count}
                    </span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(heightPercent, 4)}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className="w-full bg-bleu-france rounded-t-md min-h-[4px]"
                    />
                    <span className="text-xs text-texte-secondaire">{bucket.label}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                <Award className="h-5 w-5 text-bleu-france" />
              </div>
              <h3 className="text-lg font-bold text-texte-primaire">Résultats</h3>
            </div>

            {allCorrected && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateSummaryPDF(data)}
                  className="gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  PDF récapitulatif
                </Button>
              </div>
            )}
          </div>

          {/* Table header */}
          <div className="border border-bordure rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-fond-alt text-xs font-medium text-texte-secondaire border-b border-bordure">
              <button
                type="button"
                onClick={() => toggleSort('nom')}
                className="col-span-4 flex items-center gap-1 cursor-pointer hover:text-texte-primaire"
              >
                Élève
                {sortKey === 'nom' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
              </button>
              <div className="col-span-3 text-center">Statut</div>
              <button
                type="button"
                onClick={() => toggleSort('note')}
                className="col-span-2 flex items-center justify-center gap-1 cursor-pointer hover:text-texte-primaire"
              >
                Note
                {sortKey === 'note' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
              </button>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {/* Table body */}
            <AnimatePresence>
              {sortedCopies.map((copy) => {
                const isExpanded = expandedCopy === copy.id
                const isCorrecting = correctingIds.has(copy.id)

                return (
                  <motion.div
                    key={copy.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-bordure last:border-b-0"
                  >
                    {/* Row */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-fond-alt/30 transition-colors">
                      <div className="col-span-4 font-medium text-sm text-texte-primaire">
                        {copy.nom_eleve}
                      </div>
                      <div className="col-span-3 text-center">
                        {copy.correction ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Corrigée
                          </span>
                        ) : isCorrecting ? (
                          <span className="inline-flex items-center gap-1 text-xs text-bleu-france font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            En cours...
                          </span>
                        ) : (
                          <span className="text-xs text-texte-disabled">En attente</span>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        {copy.correction ? (
                          <span className="text-lg font-bold text-bleu-france">
                            {copy.correction.note_globale}<span className="text-xs text-texte-secondaire font-normal">/{copy.correction.total}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-texte-disabled">—</span>
                        )}
                      </div>
                      <div className="col-span-3 flex justify-end gap-1.5">
                        {!copy.correction && !isCorrecting && (
                          <Button
                            size="sm"
                            onClick={() => correctCopy(copy)}
                            className="gap-1"
                          >
                            <Sparkles className="h-3 w-3" />
                            Corriger
                          </Button>
                        )}
                        {copy.correction && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedCopy(isExpanded ? null : copy.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateStudentPDF(data, copy)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && copy.correction && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-5 pt-2 space-y-4 bg-fond-alt/20">
                            {/* Question details */}
                            {(copy.correction.questions ?? []).map((q) => (
                              <div key={q.id} className="bg-fond-card rounded-lg p-4 border border-bordure">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-medium">{q.titre}</p>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={q.note}
                                      onChange={(e) => {
                                        const newNote = Number(e.target.value)
                                        const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                          cq.id === q.id ? { ...cq, note: newNote } : cq
                                        )
                                        const newTotal = newQuestions.reduce((s, cq) => s + cq.note, 0)
                                        updateCopyCorrection(copy.id, {
                                          questions: newQuestions,
                                          note_globale: newTotal,
                                        })
                                      }}
                                      className="w-14 px-2 py-1 text-sm text-center font-bold text-bleu-france border border-bordure rounded focus:outline-none focus:ring-2 focus:ring-bleu-france"
                                      min={0}
                                      max={q.points_max}
                                      step={0.5}
                                    />
                                    <span className="text-xs text-texte-secondaire">/ {q.points_max}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-texte-secondaire">{q.justification}</p>
                                {(q.erreurs ?? []).length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {(q.erreurs ?? []).map((err, i) => (
                                      <p key={i} className="text-xs text-error">• {err}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Comment */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-texte-secondaire uppercase tracking-wide">
                                Commentaire personnalisé
                              </p>
                              <textarea
                                value={copy.correction.commentaire}
                                onChange={(e) => updateCopyCorrection(copy.id, { commentaire: e.target.value })}
                                className="w-full px-3 py-2.5 text-sm border border-bordure rounded-lg bg-fond-card focus:outline-none focus:ring-2 focus:ring-bleu-france resize-none"
                                rows={3}
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        {allCorrected && (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => generateSummaryPDF(data)}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              Exporter le récapitulatif
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
