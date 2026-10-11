import { expect, it } from 'vitest'
import { projectPath } from './resolver.js'

it('turns every path shape Next answers with into one relative to the project root', () => {
  expect(projectPath('[project]/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('file:///repo/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('/repo/ui/a%20b.tsx', '/repo')).toBe('ui/a b.tsx')
  expect(projectPath('/elsewhere/x.tsx', '/repo')).toBe('/elsewhere/x.tsx')
  expect(projectPath('/repo/x.tsx', null)).toBe('/repo/x.tsx')
})
