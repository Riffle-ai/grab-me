import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { component, fiber, text } from '../../test/fibers.js'
import { scheme } from '../../test/react-native.js'
import type { Fiber } from '../core/fiber.js'
import { collect, grab, onScreen, pick, place, screen } from './grab.js'

vi.mock('react-native', () => import('../../test/react-native.js'))

// A Metro whose /symbolicate maps each bundle line to a source file.
const SOURCES: Record<number, string> = {
  10: '/app/node_modules/react-native/Libraries/Text/Text.js',
  20: '/app/src/ui/chip.tsx',
  30: '/app/src/features/card.tsx',
  40: '/app/src/app/index.tsx',
  50: '/app/src/app/_layout.tsx',
}
function metro() {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      const { stack } = JSON.parse(String(init.body)) as { stack: Array<{ lineNumber: number }> }
      return Promise.resolve(
        Response.json({
          stack: stack.map((f) => ({ file: SOURCES[f.lineNumber], lineNumber: f.lineNumber })),
        }),
      )
    }),
  )
}
beforeEach(metro)
afterEach(() => vi.unstubAllGlobals())

// <Root> renders <Card> (index.tsx) renders <Chip> (card.tsx) renders RN's <Text> (chip.tsx),
// whose host text view is written inside React Native.
const root = component('Root', 50)
const card = component('Card', 40, root)
const chip = component('Chip', 30, card)
const rnText = component('Text', 20, chip)
const label = () =>
  fiber({
    type: 'RCTText',
    owner: rnText,
    line: 10,
    props: { style: { fontSize: 14, color: '#000' } },
    children: [text('Open')],
  })

describe('grab', () => {
  it('names the first project call as jsx and the owners above it, stopping after two app ones', async () => {
    const r = await grab([{ fiber: label(), box: { x: 0, y: 0, w: 33, h: 18 } }], {
      stopAfter: ['src/ui/'],
      route: () => '/home',
      theme: () => 'dark',
      tokens: () => ({ color: { ink: '#000' } }),
    })
    expect(r).toEqual({
      platform: 'ios',
      route: '/home',
      window: { w: 402, h: 874 },
      theme: 'dark',
      warnings: [],
      elements: [
        {
          tag: 'Text',
          attrs: {},
          text: 'Open',
          jsx: { file: 'src/ui/chip.tsx', line: 20 },
          owners: [
            { name: 'Chip', at: 'src/features/card.tsx:30' },
            { name: 'Card', at: 'src/app/index.tsx:40' },
          ],
          styles: {
            box: { w: 33, h: 18 },
            font: { size: { value: '14' } },
            color: { value: '#000', token: 'ink' },
          },
        },
      ],
    })
  })

  it('falls back to the system scheme, and warns instead of failing when Metro does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    )
    scheme.current = null
    const r = await grab([{ fiber: label(), box: { x: 0, y: 0, w: 1, h: 1 } }])
    expect(r.theme).toBe('light')
    expect(r.route).toBeUndefined()
    expect(r.warnings).toEqual(['source frames: /symbolicate answered 500'])
    expect(r.elements[0]?.jsx).toBeUndefined()
    scheme.current = 'light'
  })

  it('keeps a non-Error failure as text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('offline')),
    )
    const r = await grab([{ fiber: label(), box: { x: 0, y: 0, w: 1, h: 1 } }])
    expect(r.warnings).toEqual(['source frames: offline'])
  })
})

describe('pick', () => {
  const o = (name: string) => component(name) as Fiber
  const site = (file: string) => ({ file, line: 1 })

  it('drops owners without a project site and repeats of the same component', () => {
    const chain = [o('Row'), o('Row'), o('Lib'), o('List')]
    const sites = [site('src/a.tsx'), site('src/a.tsx'), null, site('src/b.tsx')]
    expect(pick(chain, sites, []).map((x) => x.name)).toEqual(['Row', 'List'])
  })

  it('shows at most ten owners', () => {
    const chain = Array.from({ length: 12 }, (_, i) => o(`C${i}`))
    const sites = chain.map(() => site('src/ui/x.tsx'))
    expect(pick(chain, sites, ['src/ui/'])).toHaveLength(10)
  })
})

describe('onScreen', () => {
  it('keeps a sized box that overlaps the window', () => {
    expect(onScreen({ x: 10, y: 10, w: 5, h: 5 }, 100, 100)).toBe(true)
    expect(onScreen(null, 100, 100)).toBe(false)
    expect(onScreen({ x: 10, y: 10, w: 0, h: 5 }, 100, 100)).toBe(false)
    expect(onScreen({ x: 10, y: 10, w: 5, h: 0 }, 100, 100)).toBe(false)
    expect(onScreen({ x: 120, y: 10, w: 5, h: 5 }, 100, 100)).toBe(false)
    expect(onScreen({ x: 10, y: 120, w: 5, h: 5 }, 100, 100)).toBe(false)
    expect(onScreen({ x: -10, y: 10, w: 5, h: 5 }, 100, 100)).toBe(false)
    expect(onScreen({ x: 10, y: -10, w: 5, h: 5 }, 100, 100)).toBe(false)
  })
})

describe('the screen', () => {
  const at = (y: number) => ({ x: 0, y, width: 50, height: 20 })
  const tree = () =>
    fiber({
      children: [
        fiber({
          props: { accessible: true, accessibilityLabel: 'Open filter' },
          box: at(200),
          children: [
            // Said by its control's label, so left out.
            fiber({ type: 'RCTText', box: at(205), children: [text('Open')] }),
          ],
        }),
        fiber({
          type: 'RCTText',
          owner: rnText,
          line: 10,
          box: at(100),
          children: [text('Vandaag')],
        }),
        fiber({ props: { 'aria-label': 'Menu', accessible: true }, box: at(10) }),
        fiber({ type: 'RCTText', box: at(2000), children: [text('Below the fold')] }),
        fiber({ type: 'RCTText', box: at(50), children: [] }),
        fiber({ props: { accessible: true, accessibilityLabel: 7 }, box: at(60) }),
        fiber({
          type: 'RNSScreen',
          props: { activityState: 0 },
          children: [fiber({ type: 'RCTText', box: at(1), children: [text('Previous screen')] })],
        }),
        fiber({
          props: { accessibilityElementsHidden: true },
          children: [fiber({ type: 'RCTText', box: at(1), children: [text('Hidden')] })],
        }),
        fiber({
          props: { importantForAccessibility: 'no-hide-descendants' },
          children: [fiber({ type: 'RCTText', box: at(1), children: [text('Also hidden')] })],
        }),
      ],
    })

  it('collects texts and labelled controls in view, outside hidden screens', () => {
    const items = collect(tree(), [], { w: 402, h: 874 }).map((x) => x.item.text)
    expect(items).toEqual(['Open filter', 'Vandaag', 'Menu'])
  })

  it('places each at its first call outside the library prefixes, else its first call', () => {
    const chain = [component('A'), component('B', undefined, component('Card'))] as Fiber[]
    const ui = { file: 'src/ui/x.tsx', line: 1 }
    const app = { file: 'src/app/y.tsx', line: 2 }
    expect(place(chain, [ui, app], ['src/ui/'])).toEqual({ jsx: app, owner: 'Card' })
    expect(place(chain, [ui, null], ['src/ui/'])).toEqual({ jsx: ui })
    expect(place(chain, [null, null], [])).toEqual({})
  })

  it('reads the screen top to bottom with where each piece is written', async () => {
    const r = await screen(tree(), { stopAfter: ['src/ui/'] })
    expect(r.items.map((i) => [i.text, i.box.y, i.owner, i.jsx?.file])).toEqual([
      ['Menu', 10, undefined, undefined],
      ['Vandaag', 100, 'Card', 'src/features/card.tsx'],
      ['Open filter', 200, undefined, undefined],
    ])
  })
})
