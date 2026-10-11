'use client'
import { GrabMeOverlay } from '@riffle-ai/grab-me'
import { nextResolver } from '@riffle-ai/grab-me/next'
import { useMemo } from 'react'

export default function DevGrab() {
  const resolver = useMemo(() => nextResolver(), [])
  return (
    <GrabMeOverlay
      resolver={resolver}
      stopAfter={['components/']}
      onGrab={(result, text) => console.log(text)}
    />
  )
}
