'use client'

import { cn } from '@/lib/cn'
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

interface FileUploadProps {
  label: string
  hint?: string
  accept?: string
  multiple?: boolean
  files: string[]
  onFilesChange: (files: string[]) => void
  processFiles: (files: FileList) => Promise<string[]>
  maxFiles?: number
}

export function FileUpload ({
  label,
  hint,
  accept = 'image/*,.pdf',
  multiple = true,
  files,
  onFilesChange,
  processFiles,
  maxFiles,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFiles = useCallback(async (fileList: FileList) => {
    setIsProcessing(true)
    try {
      const processed = await processFiles(fileList)
      const newFiles = [...files, ...processed]
      if (maxFiles && newFiles.length > maxFiles) {
        onFilesChange(newFiles.slice(0, maxFiles))
      } else {
        onFilesChange(newFiles)
      }
    } catch (err) {
      console.error('Erreur traitement fichiers:', err)
    }
    setIsProcessing(false)
  }, [files, maxFiles, onFilesChange, processFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleRemove = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    onFilesChange(newFiles)
  }, [files, onFilesChange])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-texte-primaire">
        {label}
      </label>
      {hint && (
        <p className="text-xs text-texte-secondaire">{hint}</p>
      )}

      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-bleu-france bg-bleu-france-light'
            : 'border-bordure hover:border-bleu-france hover:bg-fond-alt/50',
          isProcessing && 'opacity-60 pointer-events-none'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFiles(e.target.files)
              e.target.value = ''
            }
          }}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 border-3 border-bleu-france border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-texte-secondaire">Traitement en cours...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-bleu-france-light flex items-center justify-center">
              <Upload className="h-5 w-5 text-bleu-france" />
            </div>
            <div>
              <p className="text-sm font-medium text-texte-primaire">
                Glissez-déposez vos fichiers ici
              </p>
              <p className="text-xs text-texte-secondaire mt-1">
                ou cliquez pour parcourir
              </p>
            </div>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative group rounded-lg overflow-hidden border border-bordure bg-fond-card"
            >
              {file.startsWith('data:image') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file}
                  alt={`Fichier ${index + 1}`}
                  className="w-full h-24 object-cover"
                />
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-fond-alt">
                  {file.startsWith('data:application/pdf') ? (
                    <FileText className="h-8 w-8 text-texte-secondaire" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-texte-secondaire" />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(index)
                }}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs text-texte-secondaire text-center py-1.5 truncate px-2">
                Page {index + 1}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
