import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NITBox — Numbers in the Box',
  description: 'Football analytics platform for the passionate fan',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
