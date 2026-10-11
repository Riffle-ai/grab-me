import { describe, expect, it } from 'vitest'
import { pick } from './grab.js'
import type { Owner } from './fiber.js'

const client = (name: string): Owner => ({
  tag: 0,
  type: Object.defineProperty(() => null, 'name', { value: name }),
})
const server = (name: string): Owner => ({ name })
const at = (file: string, line = 1) => [{ file, line }]

describe('pick', () => {
  it('shows library components until two app components, as the original grab-me did with ui/', () => {
    const chain = [
      client('Button'),
      client('Row'),
      client('Table'),
      server('Page'),
      server('Layout'),
    ]
    const defs = {
      Button: at('ui/button.tsx'),
      Row: at('features/row.tsx'),
      Table: at('ui/table.tsx'),
      Page: at('app/page.tsx'),
      Layout: at('app/layout.tsx'),
    }
    expect(pick(chain, defs, ['ui/']).map((o) => o.name)).toEqual([
      'Button',
      'Row',
      'Table',
      'Page',
    ])
    expect(pick(chain, defs, []).map((o) => o.name)).toEqual(['Button', 'Row'])
  })

  it('lists one row per recursive component and joins several definitions', () => {
    const chain = [client('Tree'), client('Tree'), client('App')]
    const defs = { Tree: [...at('a.tsx', 1), ...at('b.tsx', 2)], App: at('app.tsx') }
    expect(pick(chain, defs, [])).toEqual([
      { name: 'Tree', server: false, at: 'a.tsx:1 | b.tsx:2' },
      { name: 'App', server: false, at: 'app.tsx:1' },
    ])
  })

  it('marks server owners', () => {
    expect(pick([server('Page')], { Page: at('app/page.tsx', 4) }, [])).toEqual([
      { name: 'Page', server: true, at: 'app/page.tsx:4' },
    ])
  })

  it('falls back to the first six names when nothing is located — anonymous ones included', () => {
    const chain = [client(''), ...['A', 'B', 'C', 'D', 'E', 'F'].map(client)]
    expect(pick(chain, {}, []).map((o) => o.name)).toEqual(['Anonymous', 'A', 'B', 'C', 'D', 'E'])
    expect(pick(chain, {}, []).every((o) => o.at === undefined)).toBe(true)
  })
})
