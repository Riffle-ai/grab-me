// Mount once in the root layout. Development only: the import sits inside the NODE_ENV
// branch, so a production build never bundles the overlay (asserted by e2e/prod-safety).
import type { NextGrabMeProps } from './client.js'

export type { NextGrabMeProps } from './client.js'
export { nextResolver, type NextResolverOptions } from './resolver.js'

export async function GrabMe(props: NextGrabMeProps) {
  if (process.env.NODE_ENV === 'development') {
    const { NextGrabMeOverlay } = await import('./client.js')
    return <NextGrabMeOverlay {...props} />
  }
  return null
}
