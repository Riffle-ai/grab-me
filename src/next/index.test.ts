import { afterEach, expect, it, vi } from 'vitest'
import { NextGrabMeOverlay } from './client.js'
import { GrabMe } from './index.js'

afterEach(() => vi.unstubAllEnvs())

it('renders nothing outside next dev, so a production build carries no overlay', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect(await GrabMe({})).toBeNull()
})

it('renders the client overlay under next dev', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  expect((await GrabMe({ stopAfter: ['ui/'] }))?.type).toBe(NextGrabMeOverlay)
})
