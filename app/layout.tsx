import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SLIM Admin',
  description: 'SLIM Admin Backend',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
