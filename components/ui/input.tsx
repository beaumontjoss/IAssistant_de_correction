'use client'

import { cn } from '@/lib/cn'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input ({ className, label, error, hint, id, ...props }, ref) {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-texte-primaire"
          >
            {label}
          </label>
        )}
        {hint && (
          <p className="text-xs text-texte-secondaire">{hint}</p>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3.5 py-2.5 bg-fond-card border rounded-lg text-sm text-texte-primaire placeholder:text-texte-disabled transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-bleu-france focus:border-bleu-france',
            error
              ? 'border-error focus:ring-error'
              : 'border-bordure hover:border-texte-disabled',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-error font-medium">{error}</p>
        )}
      </div>
    )
  }
)
