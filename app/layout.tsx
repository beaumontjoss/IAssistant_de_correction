import type { Metadata } from 'next'
import { Source_Sans_3 } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'IAssistant de correction',
  description: 'Assistant de correction de copies manuscrites par IA pour les professeurs',
}

export default function RootLayout ({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body className={`${sourceSans.variable} antialiased`}>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          gap={8}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'toast-custom',
              title: 'toast-title',
              description: 'toast-description',
              closeButton: 'toast-close',
              success: 'toast-success',
              error: 'toast-error',
              info: 'toast-info',
              warning: 'toast-warning',
            },
          }}
        />
      </body>
    </html>
  )
}
