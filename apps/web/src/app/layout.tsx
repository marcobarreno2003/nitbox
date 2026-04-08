import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'CopaFut — La app del Mundial 2026',
  description: 'La única app que necesitas para el Mundial 2026. Resultados, alineaciones, estadísticas y análisis de las 60 mejores selecciones del mundo.',
  openGraph: {
    title: 'CopaFut — La app del Mundial 2026',
    description: 'La única app que necesitas para el Mundial 2026.',
    siteName: 'CopaFut',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-background text-text-primary min-h-screen">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
