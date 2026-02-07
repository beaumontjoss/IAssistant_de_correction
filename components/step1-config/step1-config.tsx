'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { SeverityToggle } from '@/components/ui/severity-toggle'
import {
  MATIERES,
  TRANSCRIPTION_MODELS,
  CORRECTION_MODELS,
  TEXT_ONLY_MODELS,
  type ControlData,
  type Severite,
} from '@/lib/types'
import { processFiles } from '@/lib/image-utils'
import { BookOpen, Settings, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'

interface Step1ConfigProps {
  data: ControlData
  onUpdate: (updates: Partial<ControlData>) => void
  onNext: () => void
}

export function Step1Config ({ data, onUpdate, onNext }: Step1ConfigProps) {
  const handleValidate = useCallback(() => {
    if (!data.classe.trim()) {
      toast.error('Veuillez indiquer la classe')
      return
    }
    if (data.enonce_images.length === 0) {
      toast.error('Veuillez ajouter au moins une image de l\'enonce')
      return
    }
    if (TEXT_ONLY_MODELS.includes(data.modele_transcription)) {
      toast.error('Ce modele ne supporte pas la lecture d\'images. Veuillez choisir un modele multimodal.')
      return
    }
    onNext()
  }, [data, onNext])

  const handleTranscriptionModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value
    if (TEXT_ONLY_MODELS.includes(modelId)) {
      toast.error('Ce modele ne supporte pas la lecture d\'images. Veuillez choisir un modele multimodal.')
      return
    }
    onUpdate({ modele_transcription: modelId })
  }, [onUpdate])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Section: Enonce et corrige */}
      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-bleu-france" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-texte-primaire">Documents du controle</h3>
              <p className="text-sm text-texte-secondaire">Ajoutez l&apos;enonce et le corrige (optionnel)</p>
            </div>
          </div>

          <FileUpload
            label="Enonce du controle"
            hint="Images ou PDF de l'enonce. Formats acceptes : JPG, PNG, PDF"
            files={data.enonce_images}
            onFilesChange={(files) => onUpdate({ enonce_images: files })}
            processFiles={(files) => processFiles(files)}
          />

          <FileUpload
            label="Corrige (optionnel)"
            hint="Le corrige type du controle, si disponible"
            files={data.corrige_images}
            onFilesChange={(files) => onUpdate({ corrige_images: files })}
            processFiles={(files) => processFiles(files)}
          />
        </CardContent>
      </Card>

      {/* Section: Parametres */}
      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
              <Settings className="h-5 w-5 text-bleu-france" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-texte-primaire">Parametres de correction</h3>
              <p className="text-sm text-texte-secondaire">Configurez le contexte et les modeles IA</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Classe"
              placeholder="Ex: 3eme B, 1ere S2..."
              value={data.classe}
              onChange={(e) => onUpdate({ classe: e.target.value })}
            />

            <Select
              label="Matiere"
              value={data.matiere}
              onChange={(e) => onUpdate({ matiere: e.target.value })}
              options={MATIERES}
            />
          </div>

          <SeverityToggle
            value={data.severite}
            onChange={(severite: Severite) => onUpdate({ severite })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Select
              label="Modele de transcription"
              hint="Modele utilise pour lire les copies manuscrites"
              value={data.modele_transcription}
              onChange={handleTranscriptionModelChange}
              options={TRANSCRIPTION_MODELS.map((m) => ({
                value: m.id,
                label: m.label,
              }))}
            />

            <Select
              label="Modele de correction"
              hint="Modele utilise pour evaluer les copies"
              value={data.modele_correction}
              onChange={(e) => onUpdate({ modele_correction: e.target.value })}
              options={CORRECTION_MODELS.map((m) => ({
                value: m.id,
                label: m.label,
              }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={handleValidate} size="lg" className="gap-2">
          Generer le bareme
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}
