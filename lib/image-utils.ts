const MAX_WIDTH = 1024
const JPEG_QUALITY = 0.7

export function compressImage (file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width
          width = MAX_WIDTH
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Impossible de creer le contexte canvas'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        resolve(base64)
      }
      img.onerror = () => reject(new Error('Erreur lors du chargement de l\'image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

export async function processFiles (files: FileList | File[]): Promise<string[]> {
  const results: string[] = []
  const fileArray = Array.from(files)

  for (const file of fileArray) {
    if (file.type === 'application/pdf') {
      const pages = await pdfToImages(file)
      results.push(...pages)
    } else if (file.type.startsWith('image/')) {
      const compressed = await compressImage(file)
      results.push(compressed)
    }
  }

  return results
}

async function pdfToImages (file: File): Promise<string[]> {
  // For PDF support, we convert each page to an image
  // Using canvas-based approach with pdf.js would be ideal,
  // but for POC we'll read it as a data URL and let the API handle it
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      resolve([base64])
    }
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du PDF'))
    reader.readAsDataURL(file)
  })
}

export function extractBase64Data (dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return { mimeType: 'image/jpeg', data: dataUrl }
  }
  return { mimeType: match[1], data: match[2] }
}
