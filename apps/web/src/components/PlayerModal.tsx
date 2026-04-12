'use client'

/**
 * PlayerModal — In the static version, this simply redirects to the player page.
 * The original version fetched from the live API; this version works without a backend.
 */

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface PlayerModalProps {
  playerId: number | null
  onClose: () => void
}

export default function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const router = useRouter()

  useEffect(() => {
    if (playerId) {
      router.push(`/players/${playerId}`)
      onClose()
    }
  }, [playerId, router, onClose])

  return null
}
