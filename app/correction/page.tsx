'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { AnimatePresence } from 'framer-motion'
import { Stepper } from '@/components/stepper/stepper'
import { Step1Config } from '@/components/step1-config/step1-config'
import { Step2Bareme } from '@/components/step2-bareme/step2-bareme'
import { Step3Copies } from '@/components/step3-copies/step3-copies'
import { Step4Resultats } from '@/components/step4-resultats/step4-resultats'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { loadControl, saveControl, clearControl } from '@/lib/storage'
import type { ControlData } from '@/lib/types'
import { createEmptyControl } from '@/lib/types'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const STEPS = [
  { number: 1, title: 'Configuration', description: 'Énoncé et paramètres' },
  { number: 2, title: 'Barème', description: 'Barème IA' },
  { number: 3, title: 'Copies', description: 'Upload et transcription' },
  { number: 4, title: 'Résultats', description: 'Correction et export' },
]

export default function CorrectionPage () {
  const [data, setData] = useState<ControlData | null>(null)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)

  useEffect(() => {
    const loaded = loadControl()
    setData(loaded)
  }, [])

  const updateData = useCallback((updates: Partial<ControlData>) => {
    setData((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...updates }
      const saved = saveControl(next)
      if (!saved) {
        toast.error('Stockage insuffisant', {
          description: 'L\'espace de sauvegarde locale est plein. Exportez vos résultats et commencez un nouveau contrôle.',
        })
      }
      return next
    })
  }, [])

  const goToStep = useCallback((step: number) => {
    updateData({ currentStep: step })
  }, [updateData])

  const handleReset = useCallback(() => {
    clearControl()
    setData(createEmptyControl())
    setIsResetDialogOpen(false)
    toast.success('Contrôle réinitialisé', {
      description: 'Un nouveau contrôle vierge a été créé.',
    })
  }, [])

  if (!data) {
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
            <Link href="/" className="flex items-center gap-3 group">
              <div className="h-9 w-9 rounded-lg bg-bleu-france flex items-center justify-center">
                <span className="text-white font-bold text-sm">IA</span>
              </div>
              <div>
                <h1 className="text-base font-bold text-texte-primaire group-hover:text-bleu-france transition-colors">
                  IAssistant de correction
                </h1>
                <p className="text-xs text-texte-secondaire">
                  {data.matiere && data.classe
                    ? `${data.matiere} — ${data.classe}`
                    : 'Nouveau contrôle'}
                </p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsResetDialogOpen(true)}
              className="gap-1.5 text-texte-secondaire"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Nouveau
            </Button>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20">
        <div className="mb-20">
          <Stepper steps={STEPS} currentStep={data.currentStep} />
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {data.currentStep === 1 && (
            <Step1Config
              key="step1"
              data={data}
              onUpdate={updateData}
              onNext={() => goToStep(2)}
            />
          )}
          {data.currentStep === 2 && (
            <Step2Bareme
              key="step2"
              data={data}
              onUpdate={updateData}
              onNext={() => goToStep(3)}
              onPrev={() => goToStep(1)}
            />
          )}
          {data.currentStep === 3 && (
            <Step3Copies
              key="step3"
              data={data}
              onUpdate={updateData}
              onNext={() => goToStep(4)}
              onPrev={() => goToStep(2)}
            />
          )}
          {data.currentStep === 4 && (
            <Step4Resultats
              key="step4"
              data={data}
              onUpdate={updateData}
              onPrev={() => goToStep(3)}
            />
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title="Recommencer à zéro ?"
        description="Toutes les données du contrôle en cours seront définitivement supprimées : configuration, barème, copies et corrections."
        confirmLabel="Tout supprimer"
        variant="danger"
        onConfirm={handleReset}
      />
    </div>
  )
}
