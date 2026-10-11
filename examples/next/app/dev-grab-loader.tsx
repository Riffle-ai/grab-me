'use client'
import dynamic from 'next/dynamic'

// The import sits in a branch that only exists in development, so a production build never
// emits the chunk: nothing of grab-me, the resolver included, reaches the client bundle.
const DevGrab = process.env.NODE_ENV === 'development' ? dynamic(() => import('./dev-grab')) : null

export function DevGrabLoader() {
  return DevGrab && <DevGrab />
}
