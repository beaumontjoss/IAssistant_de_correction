'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileUpload } from '@/components/ui/file-upload'
import { ImageViewer } from '@/components/image-viewer/image-viewer'
import { MarkdownEditor } from '@/components/markdown-editor/markdown-editor'
import type { ControlData, CopieEleve } from '@/lib/types'
import { processFiles } from '@/lib/image-utils'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Users,
  FileText,
  CheckCircle2,
  Loader2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface Step3CopiesProps {
  data: ControlData
  onUpdate: (updates: Partial<ControlData>) => void
  onNext: () => void
  onPrev: () => void
}

export function Step3Copies ({ data, onUpdate, onNext, onPrev }: Step3CopiesProps) {
  const [expandedCopy, setExpandedCopy] = useState<string | null>(null)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [newStudentName, setNewStudentName] = useState('')

  const addCopy = useCallback(() => {
    if (!newStudentName.trim()) {
      toast.error('Veuillez indiquer le nom de l\'élève')
      return
    }

    const newCopy: CopieEleve = {
      id: crypto.randomUUID(),
      nom_eleve: newStudentName.trim(),
      images: [],
      transcription_md: null,
      transcription_validee: false,
      correction: null,
    }

    onUpdate({ copies: [...data.copies, newCopy] })
    setNewStudentName('')
    setExpandedCopy(newCopy.id)
    toast.success(`Copie ajoutée pour ${newCopy.nom_eleve}`)
  }, [newStudentName, data.copies, onUpdate])

  const updateCopy = useCallback((copyId: string, updates: Partial<CopieEleve>) => {
    const newCopies = data.copies.map((c) =>
      c.id === copyId ? { ...c, ...updates } : c
    )
    onUpdate({ copies: newCopies })
  }, [data.copies, onUpdate])

  const removeCopy = useCallback((copyId: string) => {
    onUpdate({ copies: data.copies.filter((c) => c.id !== copyId) })
    toast.success('Copie supprimée')
  }, [data.copies, onUpdate])

  const transcribeCopy = useCallback(async (copy: CopieEleve) => {
    if (copy.images.length === 0) {
      toast.error('Veuillez ajouter des images de la copie')
      return
    }

    setTranscribingId(copy.id)

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: copy.images,
          enonceImages: data.enonce_images,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur lors de la transcription')
      }

      updateCopy(copy.id, {
        transcription_md: result.transcription,
        transcription_validee: false,
      })

      toast.success('Transcription terminée')
    } catch (err) {
      console.error('Erreur transcription:', err)
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la transcription')
    } finally {
      setTranscribingId(null)
    }
  }, [data, updateCopy])

  const validateTranscription = useCallback((copyId: string) => {
    updateCopy(copyId, { transcription_validee: true })
    toast.success('Transcription validée')
  }, [updateCopy])

  const handleNext = useCallback(() => {
    const validatedCopies = data.copies.filter((c) => c.transcription_validee)
    if (validatedCopies.length === 0) {
      toast.error('Veuillez transcrire et valider au moins une copie avant de continuer')
      return
    }
    onNext()
  }, [data.copies, onNext])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
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
                Ajoutez les copies une par une, puis transcrivez-les
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Nom de l'élève (ex : Martin Dupont)"
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
        {data.copies.map((copy, index) => {
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
                  <button
                    type="button"
                    onClick={() => setExpandedCopy(isExpanded ? null : copy.id)}
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
                              Transcrite et validée
                            </span>
                          ) : copy.transcription_md ? (
                            <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                              <Eye className="h-3 w-3" />
                              À valider
                            </span>
                          ) : copy.images.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-info font-medium">
                              <FileText className="h-3 w-3" />
                              Prête à transcrire
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
                        onClick={(e) => {
                          e.stopPropagation()
                          removeCopy(copy.id)
                        }}
                        className="p-2 text-texte-disabled hover:text-error rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-texte-secondaire" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-texte-secondaire" />
                      )}
                    </div>
                  </button>

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
                          {/* Upload images */}
                          <FileUpload
                            label="Photos de la copie"
                            hint="Ajoutez les images de la copie manuscrite (une ou plusieurs pages)"
                            files={copy.images}
                            onFilesChange={(files) => updateCopy(copy.id, { images: files })}
                            processFiles={(files) => processFiles(files)}
                          />

                          {/* Transcription button */}
                          {copy.images.length > 0 && !copy.transcription_md && (
                            <Button
                              onClick={() => transcribeCopy(copy)}
                              isLoading={isTranscribing}
                              className="gap-2 w-full"
                            >
                              {isTranscribing ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Transcription en cours...
                                </>
                              ) : (
                                <>
                                  <FileText className="h-4 w-4" />
                                  Transcrire cette copie
                                </>
                              )}
                            </Button>
                          )}

                          {/* Transcription result: side by side */}
                          {copy.transcription_md && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Original images */}
                                <div>
                                  <p className="text-sm font-medium text-texte-primaire mb-2">
                                    Copie originale
                                  </p>
                                  <ImageViewer images={copy.images} />
                                </div>

                                {/* Markdown */}
                                <div>
                                  <p className="text-sm font-medium text-texte-primaire mb-2">
                                    Transcription
                                  </p>
                                  <MarkdownEditor
                                    value={copy.transcription_md}
                                    onChange={(value) => updateCopy(copy.id, { transcription_md: value })}
                                    readOnly={copy.transcription_validee}
                                  />
                                </div>
                              </div>

                              {/* Validate/Re-transcribe buttons */}
                              <div className="flex gap-3">
                                {!copy.transcription_validee ? (
                                  <>
                                    <Button
                                      onClick={() => validateTranscription(copy.id)}
                                      className="gap-2"
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      Valider la transcription
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => transcribeCopy(copy)}
                                      isLoading={isTranscribing}
                                      className="gap-2"
                                    >
                                      Retranscrire
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    onClick={() => updateCopy(copy.id, { transcription_validee: false })}
                                    className="gap-2"
                                  >
                                    Modifier la transcription
                                  </Button>
                                )}
                              </div>
                            </div>
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
      {data.copies.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-texte-disabled mx-auto mb-4" />
            <p className="text-texte-secondaire">
              Aucune copie ajoutée. Commencez par entrer le nom d&apos;un élève ci-dessus.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {data.copies.length > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <div className="flex gap-6">
                <span className="text-texte-secondaire">
                  {data.copies.length} copie{data.copies.length > 1 ? 's' : ''}
                </span>
                <span className="text-success font-medium">
                  {data.copies.filter((c) => c.transcription_validee).length} validée{data.copies.filter((c) => c.transcription_validee).length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        <Button onClick={handleNext} size="lg" className="gap-2">
          Corriger les copies
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}
