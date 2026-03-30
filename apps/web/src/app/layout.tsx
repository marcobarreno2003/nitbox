import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'NITBox — Numbers in the Box',
  description: 'Football analytics para todos, no solo para analistas.',
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
