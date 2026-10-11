// Add to vite.config plugins: serve-only, it answers grab-me's two lookups and injects the
// overlay into index.html. `vite build` never runs it, so production carries nothing.
import type { Plugin } from 'vite'
import { framesHandler, locateHandler } from './server.js'

export interface GrabMeViteOptions {
  /** Folders to search for component definitions; the whole project when absent. */
  roots?: string[]
  stopAfter?: string[]
  hosts?: string[]
}

const VIRTUAL = 'virtual:grab-me'
const RESOLVED = `\0${VIRTUAL}`

export function grabMe({ roots, ...overlay }: GrabMeViteOptions = {}): Plugin {
  return {
    name: 'grab-me',
    apply: 'serve',
    // The overlay must share the app's React: two copies break hooks. The client entry is only
    // reached through the virtual module, which Vite's startup scan cannot see: pre-bundle it,
    // or the first page load finds it late and reloads.
    config: () => ({
      resolve: { dedupe: ['react', 'react-dom'] },
      optimizeDeps: { include: ['@riffle-ai/grab-me/vite/client'] },
    }),
    configureServer(server) {
      server.middlewares.use('/__grab-me/frames', framesHandler(server))
      server.middlewares.use('/__grab-me/locate', locateHandler(server.config.root, roots))
    },
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load: (id) =>
      id === RESOLVED
        ? `import { mount } from '@riffle-ai/grab-me/vite/client'\nmount(${JSON.stringify(overlay)})\n`
        : undefined,
    transformIndexHtml: () => [
      { tag: 'script', attrs: { type: 'module', src: `/@id/${VIRTUAL}` }, injectTo: 'body' },
    ],
  }
}
