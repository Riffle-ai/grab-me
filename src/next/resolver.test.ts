import { expect, it } from 'vitest'
import { chunkOnDisk, projectPath } from './resolver.js'

it('turns every path shape Next answers with into one relative to the project root', () => {
  expect(projectPath('[project]/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('file:///repo/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('/repo/ui/a%20b.tsx', '/repo')).toBe('ui/a b.tsx')
  expect(projectPath('/elsewhere/x.tsx', '/repo')).toBe('/elsewhere/x.tsx')
  expect(projectPath('/repo/x.tsx', null)).toBe('/repo/x.tsx')
})

it('points a browser chunk URL at the chunk on disk, where Turbopack can trace it', () => {
  expect(chunkOnDisk('http://localhost:3101/_next/static/chunks/a_b._.js?v=1', '/repo')).toBe(
    '/repo/.next/dev/static/chunks/a_b._.js',
  )
  expect(chunkOnDisk('/repo/.next/dev/server/x.js', '/repo')).toBe('/repo/.next/dev/server/x.js')
  expect(chunkOnDisk('http://localhost:3101/_next/static/a.js', null)).toBe(
    'http://localhost:3101/_next/static/a.js',
  )
})
