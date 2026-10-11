import { afterEach, expect, it, vi } from 'vitest'
import { chunkOnDisk, nextResolver, projectPath } from './resolver.js'

it('turns every path shape Next answers with into one relative to the project root', () => {
  expect(projectPath('[project]/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('file:///repo/app/page.tsx', '/repo')).toBe('app/page.tsx')
  expect(projectPath('/repo/ui/a%20b.tsx', '/repo')).toBe('ui/a b.tsx')
  expect(projectPath('/elsewhere/x.tsx', '/repo')).toBe('/elsewhere/x.tsx')
  expect(projectPath('/repo/x.tsx', null)).toBe('/repo/x.tsx')
})

it('moves a browser chunk URL under the dist dir, as Next parseStack does', () => {
  const chunk = 'http://localhost:3101/_next/static/chunks/a_b._.js?v=1'
  expect(chunkOnDisk(chunk, '/repo/.next/dev')).toBe(
    'file:///repo/.next/dev/static/chunks/a_b._.js?v=1',
  )
  expect(chunkOnDisk(chunk, '/x/custom/dev/')).toBe(
    'file:///x/custom/dev/static/chunks/a_b._.js?v=1',
  )
})

it('finds the chunk under a basePath, and leaves file paths alone', () => {
  expect(chunkOnDisk('http://h/docs/_next/static/chunks/a.js', '/d')).toBe(
    'file:///d/static/chunks/a.js',
  )
  expect(chunkOnDisk('/repo/.next/dev/server/x.js', '/d')).toBe('/repo/.next/dev/server/x.js')
  expect(chunkOnDisk('http://h/other/a.js', '/d')).toBe('http://h/other/a.js')
})

const respond = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers })

function stubNext(frames: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.startsWith('/__nextjs') ? respond(frames) : respond({}, { 'x-grab-me-root': '/repo' }),
    ),
  )
}
const frame = {
  file: 'http://h/_next/static/a.js',
  methodName: 'A',
  arguments: [],
  line1: 1,
  column1: 1,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('throws what Next rejected with, so grab() can warn instead of dropping the jsx line', async () => {
  stubNext([{ status: 'rejected', reason: "Unknown url scheme 'http'" }])
  await expect(nextResolver({ distDir: '/repo/.next/dev' }).frames([frame], false)).rejects.toThrow(
    "Unknown url scheme 'http'",
  )
})

it('returns the first project frame relative to the root', async () => {
  stubNext([
    { status: 'fulfilled', value: { originalStackFrame: { file: 'node_modules/x.js', line1: 2 } } },
    { status: 'fulfilled', value: { originalStackFrame: { file: '/repo/ui/a.tsx', line1: 7 } } },
  ])
  expect(await nextResolver({ distDir: '/d' }).frames([frame], false)).toEqual({
    file: 'ui/a.tsx',
    line: 7,
  })
})

it('throws when Next did not expose its dist dir', async () => {
  await expect(nextResolver().frames([frame], false)).rejects.toThrow(
    'Next did not expose its dist dir',
  )
})

it('defaults the dist dir to what Next defines in process.env.__NEXT_DIST_DIR', async () => {
  vi.stubEnv('__NEXT_DIST_DIR', '/repo/.next/dev')
  stubNext([
    { status: 'fulfilled', value: { originalStackFrame: { file: '/repo/ui/a.tsx', line1: 7 } } },
  ])
  await nextResolver().frames([frame], false)
  const post = vi.mocked(fetch).mock.calls.find(([url]) => String(url).startsWith('/__nextjs'))
  const sent = JSON.parse((post?.[1] as RequestInit).body as string)
  expect(sent.frames[0].file).toBe('file:///repo/.next/dev/static/a.js')
})

it('asks for the project root again after a transient failure, so later grabs keep their jsx line', async () => {
  const site = {
    status: 'fulfilled',
    value: { originalStackFrame: { file: '/repo/ui/a.tsx', line1: 7 } },
  }
  let routeCalls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/__nextjs')) return respond([site])
      return ++routeCalls === 1
        ? new Response('', { status: 500 })
        : respond({}, { 'x-grab-me-root': '/repo' })
    }),
  )
  const resolver = nextResolver({ distDir: '/d' })
  await expect(resolver.frames([frame], false)).rejects.toThrow()
  expect(await resolver.frames([frame], false)).toEqual({ file: 'ui/a.tsx', line: 7 })
})
