'use client'

import { cn } from '@/lib/cn'
import type { Severite } from '@/lib/types'

interface SeverityToggleProps {
  value: Severite
  onChange: (value: Severite) => void
}

const options: { value: Severite; label: string; description: string }[] = [
  {
    value: 'indulgente',
    label: 'Indulgente',
    description: 'Valorise l\'effort et les reponses partielles',
  },
  {
    value: 'classique',
    label: 'Classique',
    description: 'Correction standard et equilibree',
  },
  {
    value: 'severe',
    label: 'Severe',
    description: 'Exigeante, reponses precises attendues',
  },
]

export function SeverityToggle ({ value, onChange }: SeverityToggleProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-texte-primaire">
        Severite de correction
      </label>
      <div className="flex bg-fond-alt rounded-lg p-1 gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer',
              value === option.value
                ? 'bg-bleu-france text-white shadow-sm'
                : 'text-texte-secondaire hover:text-texte-primaire hover:bg-fond-card'
            )}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-texte-secondaire">
        {options.find((o) => o.value === value)?.description}
      </p>
    </div>
  )
}
