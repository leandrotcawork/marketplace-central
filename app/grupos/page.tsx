'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GruposPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/classificacoes')
  }, [router])
  return null
}
