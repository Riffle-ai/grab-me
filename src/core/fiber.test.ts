import { describe, expect, it } from 'vitest'
import { callSite, nearestName, owners, ownerName, typeName, type Owner } from './fiber.js'

const err = (stack: string) => Object.assign(new Error(), { stack })
const node = (debugOwner: Owner | null) =>
  ({ __reactFiber$abc: { tag: 5, type: 'button', _debugOwner: debugOwner } }) as unknown as Element

describe('callSite', () => {
  it('skips React’s own jsx frame and keeps the first three project frames', () => {
    const cs = callSite(
      err(
        [
          'Error: react-stack-top-frame',
          '    at jsxDEV (http://x/react.js:1:1)',
          '    at Card (http://x/card.js:10:5)',
          '    at http://x/a.js:2:3',
          '    at B (http://x/b.js:3:4)',
          '    at C (http://x/c.js:4:5)',
        ].join('\n'),
      ),
    )
    expect(cs?.frames.map((f) => [f.methodName, f.file, f.line1, f.column1])).toEqual([
      ['Card', 'http://x/card.js', 10, 5],
      ['', 'http://x/a.js', 2, 3],
      ['B', 'http://x/b.js', 3, 4],
    ])
    expect(cs?.server).toBe(false)
  })

  it('marks a server frame and strips React’s server URL and its counter', () => {
    const cs = callSite(
      err('Error\n    at Page (about://React/Server/file:///app/page.tsx?42:3:9)'),
    )
    expect(cs).toEqual({
      server: true,
      frames: [
        { file: 'file:///app/page.tsx', methodName: 'Page', arguments: [], line1: 3, column1: 9 },
      ],
    })
  })

  it('gives nothing for React’s shared placeholder stack, which points nowhere real', () => {
    expect(callSite(err('Error\n    at UnknownOwner (http://x/r.js:1:1)'))).toBeNull()
  })

  it('gives nothing when there is no stack', () => {
    expect(callSite(null)).toBeNull()
    expect(callSite(err('no frames here'))).toBeNull()
  })
})

describe('owners', () => {
  it('walks client fibers then server info, nearest first', () => {
    const page = { name: 'Page', env: 'Server', owner: null }
    const card = { tag: 0, type: function Card() {}, _debugOwner: page }
    expect(owners(node(card)).map(ownerName)).toEqual(['Card', 'Page'])
    expect(nearestName(node(card))).toBe('Card')
  })

  it('stops after 40 owners, so a cycle cannot hang the page', () => {
    const a: { tag: number; type: unknown; _debugOwner?: Owner } = { tag: 0, type: function A() {} }
    a._debugOwner = a
    expect(owners(node(a))).toHaveLength(40)
  })

  it('answers empty for a node React never touched', () => {
    expect(owners({} as Element)).toEqual([])
    expect(nearestName({} as Element)).toBeNull()
  })
})

describe('typeName', () => {
  it('prefers displayName, unwraps forwardRef and memo, and gives up on strings', () => {
    const named = Object.assign(() => null, { displayName: 'Shown' })
    expect(typeName(named)).toBe('Shown')
    expect(typeName({ render: function Inner() {} })).toBe('Inner')
    expect(typeName({ type: function Memoed() {} })).toBe('Memoed')
    expect(typeName('div')).toBeNull()
  })
})
