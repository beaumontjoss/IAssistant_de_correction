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
  CORRECTION_MODELS,
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
      toast.error('Champ manquant', {
        description: 'Veuillez indiquer la classe avant de continuer.',
      })
      return
    }
    if (data.enonce_images.length === 0) {
      toast.error('Énoncé requis', {
        description: 'Ajoutez au moins une image de l\'énoncé pour pouvoir générer le barème.',
      })
      return
    }
    onNext()
  }, [data, onNext])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Section : Énoncé et corrigé */}
      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-bleu-france" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-texte-primaire">Documents du contrôle</h3>
              <p className="text-sm text-texte-secondaire">Ajoutez l&apos;énoncé et le corrigé (optionnel)</p>
            </div>
          </div>

          <FileUpload
            label="Énoncé du contrôle"
            hint="Images ou PDF de l'énoncé. Formats acceptés : JPG, PNG, PDF"
            files={data.enonce_images}
            onFilesChange={(files) => onUpdate({ enonce_images: files })}
            processFiles={(files) => processFiles(files)}
          />

          <FileUpload
            label="Corrigé (optionnel)"
            hint="Le corrigé type du contrôle, si disponible"
            files={data.corrige_images}
            onFilesChange={(files) => onUpdate({ corrige_images: files })}
            processFiles={(files) => processFiles(files)}
          />
        </CardContent>
      </Card>

      {/* Section : Paramètres */}
      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center">
              <Settings className="h-5 w-5 text-bleu-france" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-texte-primaire">Paramètres de correction</h3>
              <p className="text-sm text-texte-secondaire">Configurez le contexte et le modèle IA</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Classe"
              placeholder="Ex : 3ème B, 1ère S2..."
              value={data.classe}
              onChange={(e) => onUpdate({ classe: e.target.value })}
            />

            <Select
              label="Matière"
              value={data.matiere}
              onChange={(e) => onUpdate({ matiere: e.target.value })}
              options={MATIERES}
            />
          </div>

          <SeverityToggle
            value={data.severite}
            onChange={(severite: Severite) => onUpdate({ severite })}
          />

          <Select
            label="Modèle de correction"
            hint="Modèle utilisé pour le barème et l'évaluation des copies"
            value={data.modele_correction}
            onChange={(e) => onUpdate({ modele_correction: e.target.value })}
            options={CORRECTION_MODELS.map((m) => ({
              value: m.id,
              label: m.label,
            }))}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={handleValidate} size="lg" className="gap-2">
          Générer le barème
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}
