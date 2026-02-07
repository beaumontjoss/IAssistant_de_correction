'use client'

import { cn } from '@/lib/cn'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu-france focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          {
            'bg-bleu-france text-white hover:bg-bleu-france-hover active:bg-bleu-france-active shadow-sm': variant === 'primary',
            'bg-bleu-france-light text-bleu-france hover:bg-[#CACAFB] active:bg-[#B1B1F9]': variant === 'secondary',
            'border-2 border-bleu-france text-bleu-france bg-transparent hover:bg-bleu-france-light': variant === 'outline',
            'text-bleu-france bg-transparent hover:bg-bleu-france-light': variant === 'ghost',
            'bg-error text-white hover:bg-[#B30400] active:bg-[#990300]': variant === 'danger',
          },
          {
            'text-sm px-3 py-1.5 h-8': size === 'sm',
            'text-sm px-5 py-2.5 h-10': size === 'md',
            'text-base px-6 py-3 h-12': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
