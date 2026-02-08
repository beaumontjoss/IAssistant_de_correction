'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getAllControles, deleteControle, saveControle, countCopiesByControle } from '@/lib/db'
import { createEmptyControle, MATIERES } from '@/lib/types'
import type { Controle } from '@/lib/types'
import {
  Plus,
  BookOpen,
  Users,
  Trash2,
  Settings,
  ArrowRight,
  FolderOpen,
} from 'lucide-react'
import Link from 'next/link'

interface ControleWithCounts extends Controle {
  copiesCount: number
  correctedCount: number
}

export default function ControlesPage () {
  const router = useRouter()
  const [controles, setControles] = useState<ControleWithCounts[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadControles = useCallback(async () => {
    try {
      const all = await getAllControles()
      const withCounts = await Promise.all(
        all.map(async (c) => {
          const counts = await countCopiesByControle(c.id)
          return { ...c, copiesCount: counts.total, correctedCount: counts.corrected }
        })
      )
      setControles(withCounts)
    } catch (err) {
      console.error('Erreur chargement contrôles:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadControles() }, [loadControles])

  const handleCreate = useCallback(async () => {
    const controle = createEmptyControle()
    await saveControle(controle)
    router.push(`/controles/${controle.id}/configurer`)
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
    await deleteControle(id)
    setControles((prev) => prev.filter((c) => c.id !== id))
    setDeletingId(null)
    toast.success('Contrôle supprimé', {
      description: 'Le contrôle et toutes ses copies ont été supprimés.',
    })
  }, [])

  const getMatiereLabel = (value: string) =>
    MATIERES.find((m) => m.value === value)?.label ?? value

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (isLoading) {
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
                <p className="text-xs text-texte-secondaire">Mes contrôles</p>
              </div>
            </Link>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouveau contrôle
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Empty state */}
        {controles.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <FolderOpen className="h-16 w-16 text-texte-disabled mx-auto mb-6" />
              <h2 className="text-xl font-bold text-texte-primaire mb-2">
                Aucun contrôle
              </h2>
              <p className="text-texte-secondaire mb-8 max-w-md mx-auto">
                Créez votre premier contrôle pour commencer à corriger les copies de vos élèves avec l&apos;IA.
              </p>
              <Button onClick={handleCreate} size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Créer un contrôle
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Grid of controles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {controles.map((controle, index) => (
              <motion.div
                key={controle.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="group hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-0">
                    {/* Card body */}
                    <Link
                      href={`/controles/${controle.id}`}
                      className="block p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center flex-shrink-0">
                            <BookOpen className="h-5 w-5 text-bleu-france" />
                          </div>
                          <div>
                            <h3 className="font-bold text-texte-primaire group-hover:text-bleu-france transition-colors">
                              {controle.nom || `Contrôle de ${getMatiereLabel(controle.matiere)}`}
                            </h3>
                            <p className="text-sm text-texte-secondaire">
                              {getMatiereLabel(controle.matiere)}{controle.classe ? ` — ${controle.classe}` : ''}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-texte-disabled group-hover:text-bleu-france transition-colors flex-shrink-0 mt-1" />
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-sm">
                        {controle.bareme && (
                          <span className="text-texte-secondaire">
                            {controle.bareme.total} pts
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-texte-secondaire">
                          <Users className="h-3.5 w-3.5" />
                          {controle.copiesCount} copie{controle.copiesCount !== 1 ? 's' : ''}
                          {controle.correctedCount > 0 && (
                            <span className="text-success font-medium">
                              ({controle.correctedCount} corrigée{controle.correctedCount !== 1 ? 's' : ''})
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-texte-disabled ml-auto">
                          {formatDate(controle.updatedAt)}
                        </span>
                      </div>
                    </Link>

                    {/* Actions */}
                    <div className="border-t border-bordure px-5 py-2.5 flex items-center gap-2">
                      <Link
                        href={`/controles/${controle.id}/configurer`}
                        className="inline-flex items-center gap-1.5 text-xs text-texte-secondaire hover:text-bleu-france transition-colors px-2 py-1 rounded"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Configurer
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeletingId(controle.id)}
                        className="inline-flex items-center gap-1.5 text-xs text-texte-secondaire hover:text-error transition-colors px-2 py-1 rounded ml-auto cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null) }}
        title="Supprimer ce contrôle ?"
        description="Le contrôle, son barème et toutes les copies associées seront définitivement supprimés."
        confirmLabel="Supprimer définitivement"
        variant="danger"
        onConfirm={() => {
          if (deletingId) handleDelete(deletingId)
        }}
      />
    </div>
  )
}
