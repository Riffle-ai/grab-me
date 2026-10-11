// The browser half for Vite: a resolver over the plugin's endpoints, and mount(), which the
// plugin's injected script calls. The overlay gets its own root so the app needs no change.
import { createRoot } from 'react-dom/client'
import type { Frame } from '../core/fiber.js'
import { ok, type Resolver } from '../core/resolver.js'
import { GrabMeOverlay, type GrabMeProps } from '../overlay.js'

export function viteResolver(): Resolver {
  return {
    async frames(frames: Frame[]) {
      const res = await fetch('/__grab-me/frames', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frames }),
      })
      return (await ok(res, '/__grab-me/frames')).json()
    },
    async locate(names: string[]) {
      const res = await fetch(
        `/__grab-me/locate?names=${encodeURIComponent([...new Set(names)].join(','))}`,
      )
      return (await ok(res, '/__grab-me/locate')).json()
    },
  }
}

export function mount(opts: Pick<GrabMeProps, 'stopAfter' | 'hosts'>) {
  const host = document.createElement('div')
  host.setAttribute('data-grab-me', '')
  document.body.appendChild(host)
  createRoot(host).render(<GrabMeOverlay resolver={viteResolver()} {...opts} />)
}
