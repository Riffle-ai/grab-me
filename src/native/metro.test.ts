import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Fiber } from '../core/fiber.js'
import { relativeTo, resolve, rootOf, serverOf, sitesOf } from './metro.js'

const BUNDLE = 'http://localhost:8081/index.bundle?platform=ios&dev=true'
const frame = (line: number) => ({
  file: BUNDLE,
  methodName: 'Card',
  arguments: [],
  line1: line,
  column1: 3,
})

describe('paths', () => {
  it('reads the server from a bundle frame', () => {
    expect(serverOf(BUNDLE)).toBe('http://localhost:8081/')
    expect(serverOf('/abs/file.js')).toBeNull()
  })

  it('learns the project root from a library frame', () => {
    expect(rootOf(['/app/src/a.tsx', '/app/node_modules/react/x.js'])).toBe('/app')
    expect(rootOf(['/app/src/a.tsx'])).toBeNull()
  })

  it('strips the root from project paths only', () => {
    expect(relativeTo('/app/src/a.tsx', '/app')).toBe('src/a.tsx')
    expect(relativeTo('/other/a.tsx', '/app')).toBe('/other/a.tsx')
    expect(relativeTo('/app/src/a.tsx', null)).toBe('/app/src/a.tsx')
  })
})

describe('sitesOf', () => {
  it('parses each fiber’s JSX stack, null where React kept none', () => {
    const stack = Object.assign(new Error(), {
      stack: `Error\n    at jsxDEV (${BUNDLE}:1:1)\n    at Card (${BUNDLE}:40:7)`,
    })
    const fiber = { tag: 5, type: 'RCTView', _debugStack: stack } as Fiber
    const [site, none] = sitesOf([fiber, null])
    expect(site?.[0]).toMatchObject({ methodName: 'Card', line1: 40, column1: 7 })
    expect(none).toBeNull()
  })
})

describe('resolve', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('symbolicates every site in one request and keeps each one’s first project frame', async () => {
    const symbolicate = vi.fn((_url: string, init: RequestInit) => {
      const { stack } = JSON.parse(String(init.body)) as { stack: unknown[] }
      expect(stack).toHaveLength(3)
      return Promise.resolve(
        Response.json({
          stack: [
            { file: '/app/node_modules/react-native/Text.js', lineNumber: 9 },
            { file: '/app/src/ui/chip.tsx', lineNumber: 29 },
            { file: '/app/node_modules/expo-router/Route.js', lineNumber: 1 },
          ],
        }),
      )
    })
    vi.stubGlobal('fetch', symbolicate)
    const sites = await resolve([[frame(1), frame(2)], null, [frame(3)]])
    expect(symbolicate.mock.calls[0]?.[0]).toBe('http://localhost:8081/symbolicate')
    expect(sites).toEqual([{ file: 'src/ui/chip.tsx', line: 29 }, null, null])
  })

  it('answers nothing without a bundle frame to find the server by', async () => {
    const f = { ...frame(1), file: '/abs.js' }
    await expect(resolve([[f], null])).resolves.toEqual([null, null])
  })

  it('throws when Metro refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    )
    await expect(resolve([[frame(1)]])).rejects.toThrow('/symbolicate answered 500')
  })
})
