'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const navLinks = [
  { label: 'Blog',     href: '/blog' },
  { label: 'Results',  href: '/matches' },
  { label: 'Upcoming', href: '/upcoming' },
  { label: 'Stats',    href: '/stats' },
  { label: 'Awards',   href: '/awards' },
  { label: 'Live',     href: '/live' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [year,  setYear]  = useState('')
  const [lang,  setLang]  = useState<'en' | 'es'>('en')

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
        <Link href="/" className="shrink-0">
          <Image
            src="/nitbox-full-wordmark.png"
            alt="NITBox"
            width={180}
            height={48}
            priority
          />
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
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 ml-auto"
        >
          <input
            type="text"
            placeholder="Team 1"
            value={team1}
            onChange={(e) => setTeam1(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-24 focus:outline-none focus:border-accent transition-colors"
          />
          <span className="text-text-muted text-xs font-medium">vs</span>
          <input
            type="text"
            placeholder="Team 2"
            value={team2}
            onChange={(e) => setTeam2(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-24 focus:outline-none focus:border-accent transition-colors"
          />
          <input
            type="text"
            placeholder="Year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted w-16 focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            className="bg-accent hover:bg-accent-dim text-background text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
          >
            Search
          </button>
        </form>

        {/* Language toggle */}
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <button
            onClick={() => setLang('en')}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
              lang === 'en'
                ? 'text-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            EN
          </button>
          <span className="text-border text-xs">|</span>
          <button
            onClick={() => setLang('es')}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
              lang === 'es'
                ? 'text-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            ES
          </button>
        </div>

      </div>
    </header>
  )
}
