'use client'

// The overlay with Next's resolver built in. Functions cannot cross from a server component,
// so the resolver is made here; for a custom onGrab, render GrabMeOverlay from a client
// component of your own.
import { useMemo } from 'react'
import { GrabMeOverlay, type GrabMeProps } from '../overlay.js'
import { nextResolver, type NextResolverOptions } from './resolver.js'

export type NextGrabMeProps = Pick<GrabMeProps, 'stopAfter' | 'hosts'> & NextResolverOptions

export function NextGrabMeOverlay({ endpoint, distDir, ...props }: NextGrabMeProps) {
  const resolver = useMemo(() => nextResolver({ endpoint, distDir }), [endpoint, distDir])
  return <GrabMeOverlay resolver={resolver} {...props} />
}
