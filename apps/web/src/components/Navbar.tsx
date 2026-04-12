'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const navLinks = [
  { label: 'Resultados',    href: '/matches' },
  { label: 'Próximos',      href: '/upcoming' },
  { label: 'Estadísticas',  href: '/stats' },
  { label: 'Premios',       href: '/awards' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [year,  setYear]  = useState('')
  const [lang,  setLang]  = useState<'en' | 'es'>('es')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!team1 || !team2) return
    const params = new URLSearchParams({ team1, team2 })
    if (year) params.set('year', year)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <header className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center gap-8">

        {/* Logo */}
        <Link href="/" className="shrink-0 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-background font-black text-sm">CF</span>
          </div>
          <span className="font-black text-lg text-text-primary tracking-tight">
            Copa<span className="text-accent">Fut</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                pathname.startsWith(link.href)
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 ml-auto">
          <input
            type="text"
            placeholder="Equipo 1"
            value={team1}
            onChange={(e) => setTeam1(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-24 focus:outline-none focus:border-accent transition-colors"
          />
          <span className="text-text-muted text-xs font-medium">vs</span>
          <input
            type="text"
            placeholder="Equipo 2"
            value={team2}
            onChange={(e) => setTeam2(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-24 focus:outline-none focus:border-accent transition-colors"
          />
          <input
            type="text"
            placeholder="Año"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-16 focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            className="bg-accent hover:bg-accent-dim text-background text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
          >
            Buscar
          </button>
        </form>

        {/* Language toggle */}
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <button
            onClick={() => setLang('es')}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
              lang === 'es' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            ES
          </button>
          <span className="text-border text-xs">|</span>
          <button
            onClick={() => setLang('en')}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
              lang === 'en' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            EN
          </button>
        </div>

      </div>
    </header>
  )
}
