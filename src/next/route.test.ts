import { afterEach, expect, it, vi } from 'vitest'
import { createGrabMeRoute } from './route.js'

afterEach(() => vi.unstubAllEnvs())
const ask = (names: string) => new Request(`http://x/api/dev/grab-me?names=${names}`)

it('answers definitions and the project root under next dev', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  const res = await createGrabMeRoute({ roots: ['src/next'] })(ask('NextGrabMeOverlay,Nope'))
  expect(res.headers.get('x-grab-me-root')).toBe(process.cwd())
  expect(await res.json()).toEqual({
    NextGrabMeOverlay: [{ file: 'src/next/client.tsx', line: expect.any(Number) }],
  })
})

it('is a 404 in any other build, so production exposes nothing', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  expect((await createGrabMeRoute()(ask('A'))).status).toBe(404)
})

it('looks up at most 50 names per request', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  const names = Array.from({ length: 60 }, (_, i) => `N${i}`)
  names[55] = 'NextGrabMeOverlay'
  const res = await createGrabMeRoute({ roots: ['src/next'] })(ask(names.join(',')))
  expect(await res.json()).toEqual({})
})
