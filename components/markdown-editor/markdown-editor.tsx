'use client'

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/cn'
import { Eye, Edit3 } from 'lucide-react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  readOnly?: boolean
}

export function MarkdownEditor ({ value, onChange, className, readOnly = false }: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview')

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  return (
    <div className={cn('border border-bordure rounded-xl overflow-hidden bg-fond-card', className)}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-bordure bg-fond-alt/50">
          <span className="text-xs text-texte-secondaire font-medium">
            Éditeur Markdown
          </span>
          <div className="flex bg-fond-alt rounded-md p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                mode === 'edit'
                  ? 'bg-fond-card text-bleu-france shadow-sm'
                  : 'text-texte-secondaire hover:text-texte-primaire'
              )}
            >
              <Edit3 className="h-3 w-3" />
              Éditer
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                mode === 'preview'
                  ? 'bg-fond-card text-bleu-france shadow-sm'
                  : 'text-texte-secondaire hover:text-texte-primaire'
              )}
            >
              <Eye className="h-3 w-3" />
              Aperçu
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-h-[300px] max-h-[500px] overflow-auto">
        {mode === 'edit' && !readOnly ? (
          <textarea
            value={value}
            onChange={handleChange}
            className="w-full h-full min-h-[300px] p-4 text-sm font-mono text-texte-primaire bg-transparent resize-none focus:outline-none"
            placeholder="Contenu markdown..."
            spellCheck={false}
          />
        ) : (
          <div className="p-4 markdown-content prose prose-sm max-w-none">
            <ReactMarkdown>{value || '*Aucun contenu*'}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
