import type { Plugin } from 'vite'
import { expect, it } from 'vitest'
import { grabMe } from './plugin.js'

const call = <T>(hook: unknown, ...args: unknown[]) => (hook as (...a: unknown[]) => T)(...args)

it('is serve-only and shares the app React, so production carries nothing and hooks work', () => {
  const p: Plugin = grabMe()
  expect(p.apply).toBe('serve')
  expect(call(p.config)).toEqual({ resolve: { dedupe: ['react', 'react-dom'] } })
})

it('serves a virtual module that mounts the overlay with its options, minus roots', () => {
  const p = grabMe({ roots: ['src'], stopAfter: ['ui/'], hosts: ['Button'] })
  expect(call(p.resolveId, 'virtual:grab-me')).toBe('\0virtual:grab-me')
  expect(call(p.resolveId, 'other')).toBeUndefined()
  expect(call(p.load, '\0virtual:grab-me')).toBe(
    `import { mount } from '@riffle-ai/grab-me/vite/client'\nmount({"stopAfter":["ui/"],"hosts":["Button"]})\n`,
  )
  expect(call(p.load, 'other')).toBeUndefined()
})

it('injects the virtual module into index.html as a body script', () => {
  expect(call(grabMe().transformIndexHtml)).toEqual([
    { tag: 'script', attrs: { type: 'module', src: '/@id/virtual:grab-me' }, injectTo: 'body' },
  ])
})

it('mounts the two endpoints on the dev server', () => {
  const used: string[] = []
  const server = { config: { root: '/r' }, middlewares: { use: (path: string) => used.push(path) } }
  call(grabMe().configureServer, server)
  expect(used).toEqual(['/__grab-me/frames', '/__grab-me/locate'])
})
