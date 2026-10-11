import { expect, it } from 'vitest'
import { kindOf } from './tokens.js'

it('sorts custom properties as the dashboard did: --text-* sub-tokens are not sizes', () => {
  expect(kindOf('--color-ink')).toBe('color')
  expect(kindOf('--color-a--b')).toBe('color')
  expect(kindOf('--spacing')).toBe('space')
  expect(kindOf('--radius-md')).toBe('radius')
  expect(kindOf('--text-sm')).toBe('text')
  expect(kindOf('--text-sm--line-height')).toBeNull()
  expect(kindOf('--font-sans')).toBeNull()
})
