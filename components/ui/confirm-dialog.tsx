'use client'

import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
}

export function ConfirmDialog ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger'

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-fond-card border border-bordure shadow-2xl p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]" style={{ fontFamily: 'var(--font-marianne)' }}>
          <div className="p-6">
            {/* Icon + Title */}
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full ${isDanger ? 'bg-error-light' : 'bg-warning-light'}`}>
                <AlertTriangle className={`h-5 w-5 ${isDanger ? 'text-error' : 'text-warning'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="text-base font-semibold text-texte-primaire leading-tight">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm text-texte-secondaire leading-relaxed">
                  {description}
                </AlertDialog.Description>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-fond-alt/50 rounded-b-xl border-t border-bordure">
            <AlertDialog.Cancel className="px-4 py-2 text-sm font-medium text-texte-secondaire bg-fond-card border border-bordure rounded-lg hover:bg-fond-alt transition-colors cursor-pointer">
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer ${
                isDanger
                  ? 'bg-error hover:bg-error/90'
                  : 'bg-warning hover:bg-warning/90'
              }`}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
