'use client'

import { cn } from '@/lib/cn'
import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  hint?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select ({ className, label, error, hint, options, id, ...props }, ref) {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-texte-primaire"
          >
            {label}
          </label>
        )}
        {hint && (
          <p className="text-xs text-texte-secondaire">{hint}</p>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-3.5 py-2.5 bg-fond-card border rounded-lg text-sm text-texte-primaire appearance-none cursor-pointer transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-bleu-france focus:border-bleu-france',
              error
                ? 'border-error focus:ring-error'
                : 'border-bordure hover:border-texte-disabled',
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-texte-secondaire pointer-events-none" />
        </div>
        {error && (
          <p className="text-xs text-error font-medium">{error}</p>
        )}
      </div>
    )
  }
)
