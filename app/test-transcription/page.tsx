'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { TRANSCRIPTION_MODELS } from '@/lib/types'
import { compressImage } from '@/lib/image-utils'
import { cn } from '@/lib/cn'
import Link from 'next/link'
import {
  Upload,
  X,
  Download,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Copy,
  Eye,
  Code,
  Trash2,
} from 'lucide-react'

interface TranscriptionResult {
  modelId: string
  modelLabel: string
  transcription: string | null
  error: string | null
  elapsed_ms: number | null
  status: 'pending' | 'loading' | 'done' | 'error'
}

export default function TestTranscriptionPage () {
  const [images, setImages] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(['mistral-ocr']))
  const [results, setResults] = useState<TranscriptionResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // --- Image handling ---
  const handleFiles = useCallback(async (fileList: FileList) => {
    const newImages: string[] = []
    for (const file of Array.from(fileList)) {
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file)
        newImages.push(compressed)
      }
    }
    setImages((prev) => [...prev, ...newImages])
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // --- Model selection ---
  const toggleModel = useCallback((modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedModels(new Set(TRANSCRIPTION_MODELS.map((m) => m.id)))
  }, [])

  const selectNone = useCallback(() => {
    setSelectedModels(new Set())
  }, [])

  // --- Transcription ---
  const runTranscription = useCallback(async () => {
    if (images.length === 0) {
      toast.error('Ajoutez au moins une image')
      return
    }
    if (selectedModels.size === 0) {
      toast.error('Sélectionnez au moins un modèle')
      return
    }

    setIsRunning(true)
    const modelsToRun = TRANSCRIPTION_MODELS.filter((m) => selectedModels.has(m.id))

    // Initialize results
    const initialResults: TranscriptionResult[] = modelsToRun.map((m) => ({
      modelId: m.id,
      modelLabel: m.label,
      transcription: null,
      error: null,
      elapsed_ms: null,
      status: 'pending',
    }))
    setResults(initialResults)

    // Run all in parallel
    const promises = modelsToRun.map(async (model, index) => {
      // Mark as loading
      setResults((prev) => prev.map((r, i) =>
        i === index ? { ...r, status: 'loading' as const } : r
      ))

      try {
        const res = await fetch('/api/test-transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: model.id,
            images,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          setResults((prev) => prev.map((r, i) =>
            i === index
              ? { ...r, status: 'error' as const, error: data.error || 'Erreur inconnue' }
              : r
          ))
          return
        }

        setResults((prev) => prev.map((r, i) =>
          i === index
            ? {
                ...r,
                status: 'done' as const,
                transcription: data.transcription,
                elapsed_ms: data.elapsed_ms,
              }
            : r
        ))
      } catch (err) {
        setResults((prev) => prev.map((r, i) =>
          i === index
            ? { ...r, status: 'error' as const, error: err instanceof Error ? err.message : 'Erreur réseau' }
            : r
        ))
      }
    })

    await Promise.all(promises)
    setIsRunning(false)
    toast.success('Transcription terminée')
  }, [images, selectedModels])

  // --- Download .md ---
  const downloadMd = useCallback((result: TranscriptionResult) => {
    if (!result.transcription) return
    const blob = new Blob([result.transcription], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcription_${result.modelId}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // --- Copy to clipboard ---
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copié dans le presse-papiers')
  }, [])

  return (
    <div className="min-h-screen bg-fond-page">
      {/* Header */}
      <header className="bg-fond-card border-b border-bordure sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="p-2 rounded-lg hover:bg-fond-alt transition-colors"
                aria-label="Retour"
              >
                <ArrowLeft className="h-5 w-5 text-texte-secondaire" />
              </Link>
              <div className="h-9 w-9 rounded-lg bg-bleu-france flex items-center justify-center">
                <span className="text-white font-bold text-sm">IA</span>
              </div>
              <div>
                <h1 className="text-base font-bold text-texte-primaire">
                  Test de transcription
                </h1>
                <p className="text-xs text-texte-secondaire">
                  Photo manuscrite vers Markdown
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top section: Upload + Model selection */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Upload zone */}
          <div className="lg:col-span-1">
            <div className="bg-fond-card rounded-xl border border-bordure p-5 sticky top-24">
              <h2 className="text-sm font-bold text-texte-primaire mb-4 flex items-center gap-2">
                <Upload className="h-4 w-4 text-bleu-france" />
                Images
              </h2>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-bordure rounded-xl p-6 text-center hover:border-bleu-france hover:bg-bleu-france-light/20 transition-all cursor-pointer mb-4"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleFiles(e.target.files)
                      e.target.value = ''
                    }
                  }}
                />
                <Upload className="h-8 w-8 text-texte-disabled mx-auto mb-2" />
                <p className="text-sm text-texte-secondaire">
                  Glissez ou cliquez
                </p>
                <p className="text-xs text-texte-disabled mt-1">
                  JPG, PNG
                </p>
              </div>

              {/* Image previews */}
              {images.length > 0 && (
                <div className="space-y-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden border border-bordure">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Page ${i + 1}`} className="w-full h-32 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <p className="text-xs text-texte-secondaire text-center py-1">
                        Page {i + 1}
                      </p>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setImages([])}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-texte-secondaire hover:text-error transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Tout supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Model selection */}
          <div className="lg:col-span-2">
            <div className="bg-fond-card rounded-xl border border-bordure p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-texte-primaire">
                  Modèles ({selectedModels.size} sélectionné{selectedModels.size > 1 ? 's' : ''})
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-bleu-france hover:text-bleu-france-hover transition-colors cursor-pointer"
                  >
                    Tout sélectionner
                  </button>
                  <span className="text-texte-disabled">|</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-texte-secondaire hover:text-texte-primaire transition-colors cursor-pointer"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {TRANSCRIPTION_MODELS.map((model) => {
                  const isSelected = selectedModels.has(model.id)
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModel(model.id)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer',
                        isSelected
                          ? 'border-bleu-france bg-bleu-france-light/40 ring-1 ring-bleu-france/20'
                          : 'border-bordure hover:border-texte-disabled hover:bg-fond-alt/30'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-bleu-france border-bleu-france'
                            : 'border-texte-disabled'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-texte-primaire">{model.label}</p>
                        <p className="text-xs text-texte-disabled capitalize">{model.provider}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Run button */}
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={runTranscription}
                  disabled={isRunning || images.length === 0 || selectedModels.size === 0}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-base transition-all cursor-pointer',
                    'bg-bleu-france text-white hover:bg-bleu-france-hover active:bg-bleu-france-active shadow-sm',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Transcription en cours...
                    </>
                  ) : (
                    <>
                      Transcrire
                      {selectedModels.size > 0 && (
                        <span className="text-white/70 font-normal">
                          ({selectedModels.size} modèle{selectedModels.size > 1 ? 's' : ''})
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-lg font-bold text-texte-primaire mb-4">
                Résultats
              </h2>
              <div className={cn(
                'grid gap-4',
                results.length === 1
                  ? 'grid-cols-1'
                  : results.length === 2
                    ? 'grid-cols-1 lg:grid-cols-2'
                    : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
              )}>
                {results.map((result) => (
                  <ResultCard
                    key={result.modelId}
                    result={result}
                    onDownload={() => downloadMd(result)}
                    onCopy={() => result.transcription && copyToClipboard(result.transcription)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// --- Result Card Component ---

function ResultCard ({
  result,
  onDownload,
  onCopy,
}: {
  result: TranscriptionResult
  onDownload: () => void
  onCopy: () => void
}) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-fond-card rounded-xl border border-bordure overflow-hidden flex flex-col"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bordure bg-fond-alt/30">
        <div className="flex items-center gap-2">
          {result.status === 'loading' && (
            <Loader2 className="h-4 w-4 text-bleu-france animate-spin" />
          )}
          {result.status === 'done' && (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          {result.status === 'error' && (
            <AlertCircle className="h-4 w-4 text-error" />
          )}
          {result.status === 'pending' && (
            <Clock className="h-4 w-4 text-texte-disabled" />
          )}
          <span className="text-sm font-bold text-texte-primaire">
            {result.modelLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {result.elapsed_ms !== null && (
            <span className="text-xs text-texte-secondaire bg-fond-alt px-2 py-0.5 rounded-full">
              {(result.elapsed_ms / 1000).toFixed(1)}s
            </span>
          )}
          {result.transcription && (
            <>
              {/* View mode toggle */}
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'preview' ? 'raw' : 'preview')}
                className="p-1.5 rounded hover:bg-fond-alt transition-colors cursor-pointer"
                title={viewMode === 'preview' ? 'Voir le markdown brut' : 'Voir l\'aperçu'}
              >
                {viewMode === 'preview'
                  ? <Code className="h-3.5 w-3.5 text-texte-secondaire" />
                  : <Eye className="h-3.5 w-3.5 text-texte-secondaire" />
                }
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="p-1.5 rounded hover:bg-fond-alt transition-colors cursor-pointer"
                title="Copier"
              >
                <Copy className="h-3.5 w-3.5 text-texte-secondaire" />
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="p-1.5 rounded hover:bg-fond-alt transition-colors cursor-pointer"
                title="Télécharger le .md"
              >
                <Download className="h-3.5 w-3.5 text-texte-secondaire" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 overflow-auto max-h-[500px] p-4">
        {result.status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-10 w-10 border-3 border-bleu-france border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-texte-secondaire">Transcription en cours...</p>
          </div>
        )}

        {result.status === 'pending' && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-texte-disabled">En attente...</p>
          </div>
        )}

        {result.status === 'error' && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertCircle className="h-8 w-8 text-error" />
            <p className="text-sm text-error text-center max-w-xs">
              {result.error}
            </p>
          </div>
        )}

        {result.status === 'done' && result.transcription && (
          viewMode === 'preview' ? (
            <div className="markdown-content prose prose-sm max-w-none">
              <ReactMarkdown>{result.transcription}</ReactMarkdown>
            </div>
          ) : (
            <pre className="text-xs font-mono text-texte-primaire whitespace-pre-wrap break-words leading-relaxed">
              {result.transcription}
            </pre>
          )
        )}
      </div>

      {/* Card footer with char count */}
      {result.transcription && (
        <div className="px-4 py-2 border-t border-bordure bg-fond-alt/20">
          <p className="text-xs text-texte-disabled">
            {result.transcription.length} caractères
          </p>
        </div>
      )}
    </motion.div>
  )
}
