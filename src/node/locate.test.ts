import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { locate } from './locate.js'

let root: string
const file = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'grab-me-'))
  file('app/page.tsx', 'export default async function Page() {}\n')
  file('src/card.jsx', 'const x = 1\nexport const Card = () => null\n')
  file('src/card.test.tsx', 'function Card() {}\n')
  file('src/card.stories.tsx', 'function Card() {}\n')
  file('src/types.d.ts', 'export function Card(): void\n')
  file('node_modules/lib/index.js', 'function Card() {}\n')
  file('.next/server/page.js', 'function Page() {}\n')
  file('lib/two.ts', 'export function Card() {}\n')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

it('finds each definition in the project, skipping tests, stories, declarations and build output', () => {
  expect(locate(['Page', 'Card', 'Missing'], { root })).toEqual({
    Page: [{ file: 'app/page.tsx', line: 1 }],
    Card: [
      { file: 'lib/two.ts', line: 1 },
      { file: 'src/card.jsx', line: 2 },
    ],
  })
})

it('searches only the given roots when there are some', () => {
  expect(locate(['Card'], { root, roots: ['src'] })).toEqual({
    Card: [{ file: 'src/card.jsx', line: 2 }],
  })
})

it('says so when a configured root does not exist, instead of finding nothing quietly', () => {
  expect(() => locate(['Card'], { root, roots: ['nope'] })).toThrow(/root "nope" does not exist/)
})

it('walks the roots in the order given and sorts only within each, so the first root’s definition comes first', () => {
  expect(locate(['Card'], { root, roots: ['src', 'lib'] })).toEqual({
    Card: [
      { file: 'src/card.jsx', line: 2 },
      { file: 'lib/two.ts', line: 1 },
    ],
  })
  expect(locate(['Card'], { root, roots: ['lib', 'src'] }).Card?.[0]?.file).toBe('lib/two.ts')
})
