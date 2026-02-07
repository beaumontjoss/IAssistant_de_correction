'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ImageViewerProps {
  images: string[]
  className?: string
}

export function ImageViewer ({ images, className }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoom, setZoom] = useState(1)

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev))
    setZoom(1)
  }, [])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev))
    setZoom(1)
  }, [images.length])

  if (images.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Image display */}
      <div className="relative bg-fond-alt rounded-xl overflow-hidden border border-bordure">
        <div className="overflow-auto max-h-[500px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[currentIndex]}
            alt={`Page ${currentIndex + 1}`}
            className="w-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          />
        </div>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex gap-1 bg-fond-card/90 backdrop-blur rounded-lg p-1 shadow-sm border border-bordure">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded hover:bg-fond-alt transition-colors cursor-pointer"
            aria-label="Zoom arriere"
          >
            <ZoomOut className="h-4 w-4 text-texte-secondaire" />
          </button>
          <span className="text-xs text-texte-secondaire self-center px-1 min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-1.5 rounded hover:bg-fond-alt transition-colors cursor-pointer"
            aria-label="Zoom avant"
          >
            <ZoomIn className="h-4 w-4 text-texte-secondaire" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className="p-2 rounded-lg hover:bg-fond-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Page precedente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => { setCurrentIndex(index); setZoom(1) }}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all duration-200 cursor-pointer',
                  index === currentIndex
                    ? 'bg-bleu-france scale-110'
                    : 'bg-bordure hover:bg-texte-disabled'
                )}
                aria-label={`Page ${index + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goToNext}
            disabled={currentIndex === images.length - 1}
            className="p-2 rounded-lg hover:bg-fond-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Page suivante"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <span className="text-xs text-texte-secondaire">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}
    </div>
  )
}
