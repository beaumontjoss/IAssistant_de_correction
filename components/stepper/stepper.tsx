'use client'

import { cn } from '@/lib/cn'
import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

interface Step {
  number: number
  title: string
  description: string
}

interface StepperProps {
  steps: Step[]
  currentStep: number
}

export function Stepper ({ steps, currentStep }: StepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.number
          const isCurrent = currentStep === step.number
          const isLast = index === steps.length - 1

          return (
            <div
              key={step.number}
              className={cn(
                'flex items-center',
                !isLast && 'flex-1'
              )}
            >
              {/* Step circle + label */}
              <div className="flex flex-col items-center relative">
                <motion.div
                  initial={false}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                    backgroundColor: isCompleted
                      ? '#18753C'
                      : isCurrent
                        ? '#000091'
                        : '#E5E5E5',
                  }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10',
                    isCompleted || isCurrent ? 'text-white' : 'text-texte-secondaire'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </motion.div>
                <div className="absolute top-12 whitespace-nowrap text-center">
                  <p
                    className={cn(
                      'text-xs font-medium',
                      isCurrent ? 'text-bleu-france' : isCompleted ? 'text-success' : 'text-texte-secondaire'
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-texte-secondaire hidden sm:block mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-3 h-0.5 bg-bordure relative overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      width: isCompleted ? '100%' : '0%',
                    }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                    className="absolute inset-0 bg-success"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
