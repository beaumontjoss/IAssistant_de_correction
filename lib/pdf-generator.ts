import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ControlData, CopieEleve } from './types'

const BLEU_FRANCE: [number, number, number] = [0, 0, 145]
const GRIS: [number, number, number] = [100, 100, 100]

function setupDoc (): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  return doc
}

function addHeader (doc: jsPDF, matiere: string, classe: string) {
  doc.setFontSize(10)
  doc.setTextColor(...BLEU_FRANCE)
  doc.text('IAssistant de correction', 14, 15)

  doc.setFontSize(8)
  doc.setTextColor(...GRIS)
  doc.text(`${matiere} — ${classe}`, 14, 20)

  doc.setDrawColor(...BLEU_FRANCE)
  doc.setLineWidth(0.5)
  doc.line(14, 23, 196, 23)
}

function addFooter (doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...GRIS)
    doc.text(
      'Correction assistée par IA — vérifiée par le professeur',
      105,
      287,
      { align: 'center' }
    )
    doc.text(`${i} / ${pageCount}`, 196, 287, { align: 'right' })
  }
}

export function generateStudentPDF (data: ControlData, copy: CopieEleve): void {
  if (!copy.correction) return

  const doc = setupDoc()
  addHeader(doc, data.matiere, data.classe)

  let y = 32

  // Student name
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(copy.nom_eleve, 14, y)
  y += 10

  // Global grade
  doc.setFontSize(28)
  doc.setTextColor(...BLEU_FRANCE)
  doc.text(`${copy.correction.note_globale} / ${copy.correction.total}`, 14, y)
  y += 15

  // Questions table
  const tableData = copy.correction.questions.map((q) => [
    q.titre,
    `${q.note} / ${q.points_max}`,
    q.justification,
  ])

  autoTable(doc, {
    startY: y,
    head: [['Question', 'Note', 'Justification']],
    body: tableData,
    headStyles: {
      fillColor: BLEU_FRANCE,
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  })

  // Get final Y position after table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10

  // Points to correct
  if (copy.correction.points_a_corriger.length > 0) {
    if (y > 240) {
      doc.addPage()
      addHeader(doc, data.matiere, data.classe)
      y = 32
    }

    doc.setFontSize(11)
    doc.setTextColor(...BLEU_FRANCE)
    doc.text('Points à corriger', 14, y)
    y += 7

    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    for (const point of copy.correction.points_a_corriger) {
      if (y > 270) {
        doc.addPage()
        addHeader(doc, data.matiere, data.classe)
        y = 32
      }
      const lines = doc.splitTextToSize(`• ${point}`, 175)
      doc.text(lines, 17, y)
      y += lines.length * 4 + 2
    }
    y += 5
  }

  // Comment
  if (copy.correction.commentaire) {
    if (y > 240) {
      doc.addPage()
      addHeader(doc, data.matiere, data.classe)
      y = 32
    }

    doc.setFontSize(11)
    doc.setTextColor(...BLEU_FRANCE)
    doc.text('Commentaire', 14, y)
    y += 7

    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    const commentLines = doc.splitTextToSize(copy.correction.commentaire, 175)
    doc.text(commentLines, 14, y)
  }

  addFooter(doc)
  doc.save(`Correction_${copy.nom_eleve.replace(/\s+/g, '_')}.pdf`)
}

export function generateSummaryPDF (data: ControlData): void {
  const correctedCopies = data.copies.filter((c) => c.correction)
  if (correctedCopies.length === 0) return

  const doc = setupDoc()
  addHeader(doc, data.matiere, data.classe)

  let y = 32

  // Title
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text('Récapitulatif des notes', 14, y)
  y += 12

  // Main table
  const questionHeaders = data.bareme?.questions.map((q) => q.titre.substring(0, 15)) || []
  const headers = ['Élève', ...questionHeaders, 'Total']

  const tableData = correctedCopies.map((copy) => {
    const questionNotes = data.bareme?.questions.map((bq) => {
      const cq = copy.correction?.questions.find((q) => q.id === bq.id)
      return cq ? `${cq.note}/${cq.points_max}` : '-'
    }) || []
    return [
      copy.nom_eleve,
      ...questionNotes,
      `${copy.correction?.note_globale}/${copy.correction?.total}`,
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableData,
    headStyles: {
      fillColor: BLEU_FRANCE,
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 15

  // Statistics
  const notes = correctedCopies
    .map((c) => c.correction?.note_globale || 0)
  const total = correctedCopies[0]?.correction?.total || 20

  const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length
  const sortedNotes = [...notes].sort((a, b) => a - b)
  const mediane = sortedNotes.length % 2 === 0
    ? (sortedNotes[sortedNotes.length / 2 - 1] + sortedNotes[sortedNotes.length / 2]) / 2
    : sortedNotes[Math.floor(sortedNotes.length / 2)]
  const ecartType = Math.sqrt(
    notes.reduce((sum, n) => sum + Math.pow(n - moyenne, 2), 0) / notes.length
  )

  if (y > 240) {
    doc.addPage()
    addHeader(doc, data.matiere, data.classe)
    y = 32
  }

  doc.setFontSize(12)
  doc.setTextColor(...BLEU_FRANCE)
  doc.text('Statistiques', 14, y)
  y += 8

  const stats = [
    ['Nombre de copies', String(notes.length)],
    ['Moyenne', `${moyenne.toFixed(1)} / ${total}`],
    ['Médiane', `${mediane.toFixed(1)} / ${total}`],
    ['Écart-type', ecartType.toFixed(2)],
    ['Note minimale', `${Math.min(...notes).toFixed(1)} / ${total}`],
    ['Note maximale', `${Math.max(...notes).toFixed(1)} / ${total}`],
  ]

  autoTable(doc, {
    startY: y,
    body: stats,
    theme: 'plain',
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: BLEU_FRANCE },
      1: { halign: 'right' },
    },
    margin: { left: 14, right: 100 },
  })

  addFooter(doc)
  doc.save(`Récapitulatif_${data.classe.replace(/\s+/g, '_')}_${data.matiere}.pdf`)
}
