import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { snippet as legacy } from '../../test/legacy/inspect.js'
import { nextResolver } from '../next/resolver.js'
import { format } from './format.js'
import { grab, type Resolver } from './grab.js'

function need<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('expected the rendered element to exist')
  return x
}

// The dev server's two answers, served identically to the legacy code and to the package:
// the legacy fetches /api/dev/grab-me and /__nextjs_original-stack-frames itself, and
// nextResolver() fetches the same two URLs.
function devServer(defs: Record<string, Array<{ file: string; line: number }>>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/dev/grab-me'))
      return Response.json(defs, { headers: { 'x-grab-me-root': '/repo' } })
    if (url === '/__nextjs_original-stack-frames')
      return Response.json([
        { status: 'fulfilled', value: { originalStackFrame: { file: '[project]/ui/card.tsx', line1: 5 } } },
      ])
    throw new Error(`unexpected fetch ${url}`)
  })
}

function Card() {
  return (
    <button
      data-testid="target"
      style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink)', padding: '4px' }}
    >
      Save
    </button>
  )
}
function Screen() {
  return (
    <section style={{ display: 'flex', gap: 'var(--spacing)' }}>
      <Card />
      <Card />
    </section>
  )
}

const DEFS = { Card: [{ file: 'ui/card.tsx', line: 3 }], Screen: [{ file: 'features/screen.tsx', line: 9 }] }

beforeEach(() => {
  const s = document.createElement('style')
  s.textContent = ':root { --text-sm: 14px; --color-ink: rgb(17, 17, 17); --spacing: 4px }'
  document.head.appendChild(s)
})
afterEach(() => vi.unstubAllGlobals())

it('writes the same snippet as the dashboard’s original, for one element and for several', async () => {
  vi.stubGlobal('fetch', devServer(DEFS))
  const screen = await render(<Screen />)
  const [a0, b0] = screen.getByTestId('target').elements()
  const a = need(a0)
  const b = need(b0)
  const section = need(a.parentElement ?? undefined)
  for (const els of [[a], [a, b, section]]) {
    const ours = format(await grab(els, { resolver: nextResolver(), stopAfter: ['ui/'] }))
    expect(ours).toBe(await legacy(els))
  }
})

it('falls back to the bare owner chain exactly as the original when nothing is located', async () => {
  vi.stubGlobal('fetch', devServer({}))
  const screen = await render(<Screen />)
  const a = need(screen.getByTestId('target').elements()[0])
  expect(format(await grab([a], { resolver: nextResolver() }))).toBe(await legacy([a]))
})

it('says what it could not see instead of dropping it silently', async () => {
  const broken: Resolver = {
    frames: () => Promise.reject(new Error('/__nextjs_original-stack-frames answered 404')),
    locate: () => Promise.reject(new Error('/api/dev/grab-me answered 404')),
  }
  const screen = await render(<Screen />)
  const a = need(screen.getByTestId('target').elements()[0])
  const result = await grab([a], { resolver: broken })
  expect(result.elements[0]?.jsx).toBeUndefined()
  expect(result.warnings).toEqual([
    'component definitions: /api/dev/grab-me answered 404',
    'source frames: /__nextjs_original-stack-frames answered 404',
  ])
  expect(format(result)).toMatch(
    /\nwarnings:\n {2}component definitions: \/api\/dev\/grab-me answered 404\n {2}source frames: .*\n<\/grab-me>$/,
  )
})

it('still describes an element that left the page between hover and click', async () => {
  const screen = await render(<Screen />)
  const a = need(screen.getByTestId('target').elements()[0])
  a.remove()
  const result = await grab([a])
  expect(result.elements[0]?.styles.box).toEqual({ w: 0, h: 0 })
  expect(result.elements[0]?.attrs['data-testid']).toBe('target')
})
