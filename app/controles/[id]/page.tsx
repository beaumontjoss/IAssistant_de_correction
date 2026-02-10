'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileUpload } from '@/components/ui/file-upload'
import { ImageViewer } from '@/components/image-viewer/image-viewer'
import { MarkdownEditor } from '@/components/markdown-editor/markdown-editor'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/select'
import { getControle, getCopiesByControle, saveCopie, deleteCopie, saveControle } from '@/lib/db'
import { processFiles } from '@/lib/image-utils'
import { generateStudentPDF, generateSummaryPDF } from '@/lib/pdf-generator'
import type { Controle, CopieEleve, Correction } from '@/lib/types'
import { MATIERES, CORRECTION_MODELS } from '@/lib/types'
import {
  ArrowLeft,
  Plus,
  Users,
  FileText,
  CheckCircle2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Settings,
  Sparkles,
  Award,
  BarChart3,
  Loader2,
  Download,
  FileDown,
  Edit3,
  ClipboardList,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'

type SortKey = 'nom' | 'note'
type SortDir = 'asc' | 'desc'

export default function ControlePage () {
  const params = useParams()
  const router = useRouter()
  const controleId = params.id as string

  const [controle, setControle] = useState<Controle | null>(null)
  const [copies, setCopies] = useState<CopieEleve[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // UI state
  const [expandedCopy, setExpandedCopy] = useState<string | null>(null)
  const [newStudentName, setNewStudentName] = useState('')
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [correctingIds, setCorrectingIds] = useState<Set<string>>(new Set())
  const [deletingCopyId, setDeletingCopyId] = useState<string | null>(null)
  const [reuploadCopyId, setReuploadCopyId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('nom')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Load data
  useEffect(() => {
    Promise.all([
      getControle(controleId),
      getCopiesByControle(controleId),
    ]).then(([c, cop]) => {
      if (!c) {
        toast.error('Contrôle introuvable')
        router.push('/controles')
        return
      }
      setControle(c)
      setCopies(cop)
      setIsLoading(false)
    })
  }, [controleId, router])

  const getMatiereLabel = (value: string) =>
    MATIERES.find((m) => m.value === value)?.label ?? value

  // ─── Copies management ─────────────────────────────────

  // Changer le modèle de correction directement depuis cette page
  const updateModeleCorrection = useCallback(async (modelId: string) => {
    if (!controle) return
    const updated = { ...controle, modele_correction: modelId }
    setControle(updated)
    await saveControle(updated)
  }, [controle])

  const addCopy = useCallback(async () => {
    const name = newStudentName.trim() || `Élève ${copies.length + 1}`

    const newCopy: CopieEleve = {
      id: crypto.randomUUID(),
      controleId,
      nom_eleve: name,
      images: [],
      transcription_md: null,
      transcription_validee: false,
      correction: null,
    }

    await saveCopie(newCopy)
    setCopies((prev) => [...prev, newCopy])
    setNewStudentName('')
    setExpandedCopy(newCopy.id)
    toast.success('Copie ajoutée', { description: `La copie de ${newCopy.nom_eleve} est prête.` })
  }, [newStudentName, controleId, copies.length])

  const updateCopy = useCallback(async (copyId: string, updates: Partial<CopieEleve>) => {
    setCopies((prev) => {
      const updated = prev.map((c) => c.id === copyId ? { ...c, ...updates } : c)
      // Save async
      const copy = updated.find((c) => c.id === copyId)
      if (copy) saveCopie(copy)
      return updated
    })
  }, [])

  const removeCopy = useCallback(async (copyId: string) => {
    await deleteCopie(copyId)
    setCopies((prev) => prev.filter((c) => c.id !== copyId))
    setDeletingCopyId(null)
    toast.success('Copie supprimée')
  }, [])

  // ─── Transcription ─────────────────────────────────────

  const transcribeCopy = useCallback(async (copy: CopieEleve) => {
    if (!controle || copy.images.length === 0) {
      toast.error('Images manquantes', { description: 'Ajoutez les photos de la copie.' })
      return
    }

    setTranscribingId(copy.id)
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: copy.images,
          // N'envoyer les images de l'énoncé que si le texte transcrit n'existe pas
          enonceImages: controle.enonce_text ? [] : controle.enonce_images,
          enonceText: controle.enonce_text ?? undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur de transcription')

      // Auto-remplir le nom si extrait et que le nom actuel est un placeholder
      const updates: Partial<CopieEleve> = {
        transcription_md: result.transcription,
        transcription_validee: false,
      }
      const isPlaceholder = /^Élève \d+$/i.test(copy.nom_eleve) || copy.nom_eleve.trim() === ''
      if (result.nom_eleve && isPlaceholder) {
        updates.nom_eleve = result.nom_eleve
        toast.success('Transcription terminée', { description: `Nom détecté : ${result.nom_eleve}. Relisez et validez.` })
      } else if (result.nom_eleve && !isPlaceholder) {
        toast.success('Transcription terminée', { description: `Nom détecté sur la copie : ${result.nom_eleve}. Relisez et validez.` })
      } else {
        toast.success('Transcription terminée', { description: 'Relisez et validez.' })
      }

      await updateCopy(copy.id, updates)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error('Échec de la transcription', { description: msg })
    } finally {
      setTranscribingId(null)
    }
  }, [controle, updateCopy])

  const validateTranscription = useCallback(async (copyId: string) => {
    await updateCopy(copyId, { transcription_validee: true })
    toast.success('Transcription validée')
  }, [updateCopy])

  const reuploadCopy = useCallback(async (copyId: string) => {
    await updateCopy(copyId, {
      images: [],
      transcription_md: null,
      transcription_validee: false,
      correction: null,
    })
    setReuploadCopyId(null)
    setExpandedCopy(copyId)
    toast.success('Copie réinitialisée', { description: 'Vous pouvez réuploader les images.' })
  }, [updateCopy])

  // ─── Correction ────────────────────────────────────────

  // Construire le contexte des corrections précédentes pour assurer l'équité
  const buildPreviousCorrections = useCallback((excludeCopyId: string) => {
    return copies
      .filter((c) => c.correction && c.id !== excludeCopyId)
      .map((c) => ({
        nom_eleve: c.nom_eleve,
        note_globale: c.correction!.note_globale,
        total: c.correction!.total,
        questions: (c.correction!.questions ?? []).map((q) => ({
          titre: q.titre,
          note: q.note,
          points_max: q.points_max,
          justification: q.justification,
        })),
      }))
  }, [copies])

  const correctCopy = useCallback(async (copy: CopieEleve) => {
    if (!controle || !copy.transcription_md || !controle.bareme) return

    setCorrectingIds((prev) => new Set(prev).add(copy.id))
    try {
      const previousCorrections = buildPreviousCorrections(copy.id)

      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: controle.modele_correction,
          matiere: controle.matiere,
          classe: controle.classe,
          severite: controle.severite,
          baremeJson: JSON.stringify(controle.bareme),
          mdCopie: copy.transcription_md,
          enonceText: controle.enonce_text || null,
          corrigeText: controle.corrige_text || null,
          previousCorrections: previousCorrections.length > 0 ? previousCorrections : undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur de correction')

      await updateCopy(copy.id, { correction: result.correction as Correction })
      toast.success(`${copy.nom_eleve} — Corrigée`)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      const isNetwork = msg.includes('fetch failed') || msg.includes('Failed to fetch')
      toast.error(isNetwork ? 'Problème de connexion' : 'Échec de la correction', {
        description: isNetwork ? 'Vérifiez votre connexion internet.' : msg,
      })
    } finally {
      setCorrectingIds((prev) => {
        const next = new Set(prev)
        next.delete(copy.id)
        return next
      })
    }
  }, [controle, updateCopy, buildPreviousCorrections])

  const correctAll = useCallback(async () => {
    const toCorrect = copies.filter((c) => c.transcription_validee && !c.correction)
    for (const copy of toCorrect) {
      await correctCopy(copy)
    }
  }, [copies, correctCopy])

  const updateCopyCorrection = useCallback(async (copyId: string, updates: Partial<Correction>) => {
    setCopies((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== copyId || !c.correction) return c
        const newCorrection = { ...c.correction, ...updates }
        const newCopy = { ...c, correction: newCorrection }
        saveCopie(newCopy)
        return newCopy
      })
      return updated
    })
  }, [])

  // ─── Sort & stats ──────────────────────────────────────

  const validatedCopies = useMemo(() => copies.filter((c) => c.transcription_validee), [copies])
  const correctedCopies = useMemo(() => copies.filter((c) => c.correction), [copies])
  const allCorrected = correctedCopies.length === validatedCopies.length && validatedCopies.length > 0
  const uncorrectedCount = validatedCopies.length - correctedCopies.length

  const sortedCorrected = useMemo(() => {
    if (correctedCopies.length === 0) return []
    const sorted = [...correctedCopies].sort((a, b) => {
      if (sortKey === 'nom') return sortDir === 'asc' ? a.nom_eleve.localeCompare(b.nom_eleve) : b.nom_eleve.localeCompare(a.nom_eleve)
      const noteA = a.correction?.note_globale ?? -1
      const noteB = b.correction?.note_globale ?? -1
      return sortDir === 'asc' ? noteA - noteB : noteB - noteA
    })
    return sorted
  }, [correctedCopies, sortKey, sortDir])

  const stats = useMemo(() => {
    const notes = correctedCopies.map((c) => c.correction!.note_globale)
    if (notes.length === 0) return null
    const total = correctedCopies[0]?.correction?.total || 20
    const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length
    const sortedNotes = [...notes].sort((a, b) => a - b)
    const mediane = sortedNotes.length % 2 === 0
      ? (sortedNotes[sortedNotes.length / 2 - 1] + sortedNotes[sortedNotes.length / 2]) / 2
      : sortedNotes[Math.floor(sortedNotes.length / 2)]
    const ecartType = Math.sqrt(notes.reduce((sum, n) => sum + Math.pow(n - moyenne, 2), 0) / notes.length)
    const bucketSize = total / 5
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const min = i * bucketSize
      const max = (i + 1) * bucketSize
      const count = notes.filter((n) => n >= min && (i === 4 ? n <= max : n < max)).length
      return { min, max, count, label: `${min.toFixed(0)}-${max.toFixed(0)}` }
    })
    return { count: notes.length, total, moyenne, mediane, ecartType, min: Math.min(...notes), max: Math.max(...notes), distribution }
  }, [correctedCopies])

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }, [sortKey])

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
                  {controle.nom || `Contrôle de ${getMatiereLabel(controle.matiere)}`}
                </h1>
                <p className="text-xs text-texte-secondaire">
                  {getMatiereLabel(controle.matiere)} — {controle.classe}
                  {controle.bareme ? ` — ${controle.bareme.total} pts` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:block w-48">
                <Select
                  value={controle.modele_correction}
                  onChange={(e) => updateModeleCorrection(e.target.value)}
                  options={CORRECTION_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                />
              </div>
              <Link href={`/controles/${controle.id}/configurer`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* No barème warning */}
        {!controle.bareme && (
          <Card>
            <CardContent className="py-8 text-center">
              <ClipboardList className="h-12 w-12 text-texte-disabled mx-auto mb-4" />
              <h3 className="text-lg font-bold text-texte-primaire mb-2">Barème manquant</h3>
              <p className="text-texte-secondaire mb-6">
                Configurez le contrôle et générez un barème avant d&apos;ajouter des copies.
              </p>
              <Link href={`/controles/${controle.id}/configurer`}>
                <Button className="gap-2">
                  <Settings className="h-4 w-4" />
                  Configurer le contrôle
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ─── Copies section ─────────────────────────── */}
        {controle.bareme && (
          <>
            {/* Add student */}
            <Card>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                    <Users className="h-5 w-5 text-bleu-france" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-texte-primaire">Copies des élèves</h3>
                    <p className="text-sm text-texte-secondaire">
                      Ajoutez les copies, transcrivez-les puis lancez la correction
                    </p>
                  </div>
                </div>

                {/* Model selector (visible on mobile) */}
                <div className="sm:hidden">
                  <Select
                    label="Modèle de correction"
                    value={controle.modele_correction}
                    onChange={(e) => updateModeleCorrection(e.target.value)}
                    options={CORRECTION_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Nom de l'élève (optionnel — sera détecté automatiquement)"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addCopy() }}
                    />
                  </div>
                  <Button onClick={addCopy} className="gap-2 flex-shrink-0">
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Copies list */}
            <AnimatePresence mode="popLayout">
              {copies.map((copy, index) => {
                const isExpanded = expandedCopy === copy.id
                const isTranscribing = transcribingId === copy.id

                return (
                  <motion.div
                    key={copy.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card>
                      <CardContent className="p-0">
                        {/* Header */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedCopy(isExpanded ? null : copy.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedCopy(isExpanded ? null : copy.id) } }}
                          className="w-full flex items-center justify-between p-5 hover:bg-fond-alt/30 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-bleu-france text-white flex items-center justify-center text-sm font-bold">
                              {index + 1}
                            </div>
                            <div className="text-left">
                              <p className="font-medium text-texte-primaire">{copy.nom_eleve}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {copy.images.length > 0 && (
                                  <span className="text-xs text-texte-secondaire">
                                    {copy.images.length} page{copy.images.length > 1 ? 's' : ''}
                                  </span>
                                )}
                                {copy.transcription_validee ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Validée
                                  </span>
                                ) : copy.transcription_md ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                                    <Eye className="h-3 w-3" />
                                    À valider
                                  </span>
                                ) : copy.images.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-info font-medium">
                                    <FileText className="h-3 w-3" />
                                    Prête
                                  </span>
                                ) : null}
                                {copy.correction && (
                                  <span className="inline-flex items-center gap-1 text-xs text-success font-medium bg-success-light px-2 py-0.5 rounded-full">
                                    {copy.correction.note_globale}/{copy.correction.total}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDeletingCopyId(copy.id) }}
                              className="p-2 text-texte-disabled hover:text-error rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {isExpanded ? <ChevronUp className="h-5 w-5 text-texte-secondaire" /> : <ChevronDown className="h-5 w-5 text-texte-secondaire" />}
                          </div>
                        </div>

                        {/* Expanded content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-5 border-t border-bordure pt-5 space-y-5">
                                {/* Upload images — masqué après transcription */}
                                {!copy.transcription_md ? (
                                  <>
                                    <FileUpload
                                      label="Photos de la copie"
                                      hint="Images de la copie manuscrite"
                                      files={copy.images}
                                      onFilesChange={(files) => updateCopy(copy.id, { images: files })}
                                      processFiles={(files) => processFiles(files)}
                                    />

                                    {/* Transcription button */}
                                    {copy.images.length > 0 && (
                                      <Button
                                        onClick={() => transcribeCopy(copy)}
                                        isLoading={isTranscribing}
                                        className="gap-2 w-full"
                                      >
                                        {!isTranscribing && <FileText className="h-4 w-4" />}
                                        {isTranscribing ? 'Transcription en cours...' : 'Transcrire cette copie'}
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  /* Transcription result */
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-sm font-medium text-texte-primaire mb-2">Copie originale</p>
                                        <ImageViewer images={copy.images} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-texte-primaire mb-2">Transcription</p>
                                        <MarkdownEditor
                                          value={copy.transcription_md}
                                          onChange={(value) => updateCopy(copy.id, { transcription_md: value })}
                                          readOnly={copy.transcription_validee}
                                        />
                                      </div>
                                    </div>

                                    <div className="flex gap-3">
                                      {!copy.transcription_validee ? (
                                        <Button onClick={() => validateTranscription(copy.id)} className="gap-2">
                                          <CheckCircle2 className="h-4 w-4" />
                                          Valider la transcription
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" onClick={() => updateCopy(copy.id, { transcription_validee: false })} className="gap-2">
                                          <Edit3 className="h-3.5 w-3.5" />
                                          Modifier la transcription
                                        </Button>
                                      )}
                                      <Button
                                        variant="outline"
                                        onClick={() => setReuploadCopyId(copy.id)}
                                        className="gap-2"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Réuploader la copie
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Inline correction result */}
                                {copy.correction && (
                                  <div className="space-y-4 bg-fond-alt/30 rounded-xl p-5 border border-bordure">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-bold text-texte-primaire flex items-center gap-2">
                                        <Award className="h-5 w-5 text-bleu-france" />
                                        Correction
                                      </h4>
                                      <span className="text-2xl font-bold text-bleu-france">
                                        {copy.correction.note_globale}<span className="text-sm text-texte-secondaire font-normal">/{copy.correction.total}</span>
                                      </span>
                                    </div>

                                    {(copy.correction.questions ?? []).map((q) => (
                                      <div key={q.id} className="bg-fond-card rounded-lg p-4 border border-bordure">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                          <p className="text-sm font-medium flex-1 min-w-0">{q.titre}</p>
                                          <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                                            <input
                                              type="number"
                                              value={q.note}
                                              onChange={(e) => {
                                                const newNote = Number(e.target.value)
                                                const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                                  cq.id === q.id ? { ...cq, note: newNote } : cq
                                                )
                                                const newTotal = newQuestions.reduce((s, cq) => s + cq.note, 0)
                                                updateCopyCorrection(copy.id, { questions: newQuestions, note_globale: newTotal })
                                              }}
                                              className="w-14 px-2 py-1 text-sm text-center font-bold text-bleu-france border border-bordure rounded focus:outline-none focus:ring-2 focus:ring-bleu-france"
                                              min={0} max={q.points_max} step={0.5}
                                            />
                                            <span className="text-xs text-texte-secondaire">/ {q.points_max}</span>
                                          </div>
                                        </div>
                                        <textarea
                                          value={q.justification ?? ''}
                                          onChange={(e) => {
                                            const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                              cq.id === q.id ? { ...cq, justification: e.target.value } : cq
                                            )
                                            updateCopyCorrection(copy.id, { questions: newQuestions })
                                          }}
                                          className="w-full text-xs text-texte-secondaire bg-transparent border border-transparent rounded px-1 py-1 hover:border-bordure focus:border-bleu-france focus:outline-none transition-colors resize-none overflow-hidden"
                                          rows={1}
                                          onInput={(e) => {
                                            const ta = e.target as HTMLTextAreaElement
                                            ta.style.height = 'auto'
                                            ta.style.height = ta.scrollHeight + 'px'
                                          }}
                                          ref={(el) => {
                                            if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
                                          }}
                                        />
                                        <textarea
                                          value={(q.erreurs ?? []).map((e) => `• ${e}`).join('\n')}
                                          onChange={(e) => {
                                            const lines = e.target.value.split('\n')
                                            const erreurs = lines.map((l) => l.replace(/^•\s*/, ''))
                                            const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                              cq.id === q.id ? { ...cq, erreurs } : cq
                                            )
                                            updateCopyCorrection(copy.id, { questions: newQuestions })
                                          }}
                                          onBlur={(e) => {
                                            const lines = e.target.value.split('\n')
                                            const erreurs = lines.map((l) => l.replace(/^•\s*/, '').trim()).filter(Boolean)
                                            const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                              cq.id === q.id ? { ...cq, erreurs } : cq
                                            )
                                            updateCopyCorrection(copy.id, { questions: newQuestions })
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault()
                                              const ta = e.target as HTMLTextAreaElement
                                              const pos = ta.selectionStart
                                              const val = ta.value
                                              const newVal = val.slice(0, pos) + '\n• ' + val.slice(pos)
                                              const lines = newVal.split('\n')
                                              const erreurs = lines.map((l) => l.replace(/^•\s*/, ''))
                                              const newQuestions = (copy.correction!.questions ?? []).map((cq) =>
                                                cq.id === q.id ? { ...cq, erreurs } : cq
                                              )
                                              updateCopyCorrection(copy.id, { questions: newQuestions })
                                              requestAnimationFrame(() => {
                                                ta.selectionStart = ta.selectionEnd = pos + 3
                                                ta.style.height = 'auto'
                                                ta.style.height = ta.scrollHeight + 'px'
                                              })
                                            }
                                          }}
                                          placeholder="Ajouter des remarques..."
                                          className="w-full mt-1 text-xs text-error bg-transparent border border-transparent rounded px-1 py-1 hover:border-bordure focus:border-error/50 focus:outline-none transition-colors resize-none overflow-hidden"
                                          rows={1}
                                          onInput={(e) => {
                                            const ta = e.target as HTMLTextAreaElement
                                            ta.style.height = 'auto'
                                            ta.style.height = ta.scrollHeight + 'px'
                                          }}
                                          ref={(el) => {
                                            if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
                                          }}
                                        />
                                      </div>
                                    ))}

                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-texte-secondaire uppercase tracking-wide">Commentaire</p>
                                      <textarea
                                        value={copy.correction.commentaire ?? ''}
                                        onChange={(e) => updateCopyCorrection(copy.id, { commentaire: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm border border-bordure rounded-lg bg-fond-card focus:outline-none focus:ring-2 focus:ring-bleu-france resize-none"
                                        rows={3}
                                      />
                                    </div>

                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => generateStudentPDF(controle, copy)}
                                        className="gap-1.5"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        Télécharger le PDF
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => correctCopy(copy)}
                                        isLoading={correctingIds.has(copy.id)}
                                        className="gap-1.5"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Recorriger
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Correct button (if validated but not corrected) */}
                                {copy.transcription_validee && !copy.correction && (
                                  <Button
                                    onClick={() => correctCopy(copy)}
                                    isLoading={correctingIds.has(copy.id)}
                                    className="gap-2 w-full"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                    Corriger cette copie
                                  </Button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Empty state */}
            {copies.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-texte-disabled mx-auto mb-4" />
                  <p className="text-texte-secondaire">
                    Aucune copie ajoutée. Entrez le nom d&apos;un élève ci-dessus.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Correct all CTA */}
            {uncorrectedCount > 0 && (
              <Card>
                <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-bleu-france" />
                    </div>
                    <div>
                      <p className="font-bold text-texte-primaire">
                        {uncorrectedCount} copie{uncorrectedCount > 1 ? 's' : ''} en attente
                      </p>
                      <p className="text-sm text-texte-secondaire">
                        Lancez la correction IA pour toutes les copies validées
                      </p>
                    </div>
                  </div>
                  <Button onClick={correctAll} isLoading={correctingIds.size > 0} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Tout corriger
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ─── Statistics ────────────────────────────── */}
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
                      { label: 'Min', value: `${stats.min.toFixed(1)}/${stats.total}` },
                      { label: 'Max', value: `${stats.max.toFixed(1)}/${stats.total}` },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-fond-alt rounded-xl p-3 text-center">
                        <p className="text-xs text-texte-secondaire">{stat.label}</p>
                        <p className="text-lg font-bold text-bleu-france mt-1">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Distribution */}
                  <div className="flex items-end gap-2 h-32">
                    {stats.distribution.map((bucket) => {
                      const maxCount = Math.max(...stats.distribution.map((b) => b.count), 1)
                      const heightPercent = (bucket.count / maxCount) * 100
                      return (
                        <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-texte-secondaire font-medium">{bucket.count}</span>
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
            {correctedCopies.length > 0 && (
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
                        <Award className="h-5 w-5 text-bleu-france" />
                      </div>
                      <h3 className="text-lg font-bold text-texte-primaire">Récapitulatif</h3>
                    </div>
                    {allCorrected && (
                      <Button variant="outline" size="sm" onClick={() => generateSummaryPDF(controle, copies)} className="gap-1.5">
                        <FileDown className="h-3.5 w-3.5" />
                        PDF récapitulatif
                      </Button>
                    )}
                  </div>

                  <div className="border border-bordure rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-fond-alt text-xs font-medium text-texte-secondaire border-b border-bordure">
                      <button type="button" onClick={() => toggleSort('nom')} className="col-span-5 flex items-center gap-1 cursor-pointer hover:text-texte-primaire">
                        Élève {sortKey === 'nom' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                      <button type="button" onClick={() => toggleSort('note')} className="col-span-3 flex items-center justify-center gap-1 cursor-pointer hover:text-texte-primaire">
                        Note {sortKey === 'note' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                      <div className="col-span-4 text-right">Actions</div>
                    </div>

                    {sortedCorrected.map((copy) => (
                      <div key={copy.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-bordure last:border-b-0 hover:bg-fond-alt/30 transition-colors">
                        <div className="col-span-5 font-medium text-sm text-texte-primaire">{copy.nom_eleve}</div>
                        <div className="col-span-3 text-center">
                          <span className="text-lg font-bold text-bleu-france">
                            {copy.correction?.note_globale}<span className="text-xs text-texte-secondaire font-normal">/{copy.correction?.total}</span>
                          </span>
                        </div>
                        <div className="col-span-4 flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => setExpandedCopy(expandedCopy === copy.id ? null : copy.id)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => generateStudentPDF(controle, copy)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary stats bar */}
            {copies.length > 0 && (
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-6">
                      <span className="text-texte-secondaire">
                        {copies.length} copie{copies.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-success font-medium">
                        {validatedCopies.length} validée{validatedCopies.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-bleu-france font-medium">
                        {correctedCopies.length} corrigée{correctedCopies.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    {allCorrected && (
                      <Button variant="secondary" size="sm" onClick={() => generateSummaryPDF(controle, copies)} className="gap-2">
                        <FileDown className="h-4 w-4" />
                        Exporter
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Delete copy dialog */}
      <ConfirmDialog
        open={deletingCopyId !== null}
        onOpenChange={(open) => { if (!open) setDeletingCopyId(null) }}
        title="Supprimer cette copie ?"
        description={`La copie${deletingCopyId ? ` de ${copies.find((c) => c.id === deletingCopyId)?.nom_eleve ?? ''}` : ''} sera définitivement supprimée.`}
        confirmLabel="Supprimer la copie"
        onConfirm={() => { if (deletingCopyId) removeCopy(deletingCopyId) }}
      />

      {/* Reupload copy dialog */}
      <ConfirmDialog
        open={reuploadCopyId !== null}
        onOpenChange={(open) => { if (!open) setReuploadCopyId(null) }}
        title="Réuploader cette copie ?"
        description="Les images actuelles, la transcription et la correction seront supprimées. Vous devrez réuploader les photos et relancer la transcription."
        confirmLabel="Réuploader"
        onConfirm={() => { if (reuploadCopyId) reuploadCopy(reuploadCopyId) }}
      />
    </div>
  )
}
