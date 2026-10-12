import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { expect, it, vi } from 'vitest'
import type { ViteDevServer } from 'vite'
import { firstSite, framesHandler, locateHandler, toProject } from './server.js'

it('makes a source-map source relative to the project, and refuses dependencies and outsiders', () => {
  expect(toProject('/repo', '/repo/src/card.tsx', '/repo/src/card.tsx')).toBe('src/card.tsx')
  expect(toProject('/repo', '/repo/src/card.tsx', 'card.tsx')).toBe('src/card.tsx')
  expect(toProject('/repo', '/repo/src/x.tsx', '/repo/node_modules/lib/a.js')).toBeNull()
  expect(toProject('/repo', '/repo/src/x.tsx', '/elsewhere/a.ts')).toBeNull()
})

const frame = (file: string) => ({ file, methodName: 'A', arguments: [], line1: 1, column1: 1 })
const serverWith = (getModuleByUrl: () => unknown) =>
  ({
    config: { root: '/repo' },
    environments: { client: { moduleGraph: { getModuleByUrl } } },
  }) as unknown as ViteDevServer

it('throws when no frame can be mapped, so grab() warns instead of dropping the jsx line', async () => {
  const server = serverWith(() => undefined)
  await expect(firstSite(server, [frame('http://h/src/card.tsx')])).rejects.toThrow(
    "no source map in Vite's module graph for http://h/src/card.tsx",
  )
})

it('answers null, not an error, when every frame is a dependency or there are none', async () => {
  const map = { version: 3, sources: ['/repo/node_modules/r/a.js'], names: [], mappings: 'AAAA' }
  const server = serverWith(() => ({ file: '/repo/node_modules/r/a.js', transformResult: { map } }))
  expect(await firstSite(server, [frame('http://h/a.js')])).toBeNull()
  expect(await firstSite(server, [])).toBeNull()
})

it('treats a frame that is not a URL as not a module, so a dependency stack still answers null', async () => {
  const map = { version: 3, sources: ['/repo/node_modules/r/a.js'], names: [], mappings: 'AAAA' }
  const server = serverWith((url?: unknown) =>
    url === '/a.js' ? { file: '/repo/node_modules/r/a.js', transformResult: { map } } : undefined,
  )
  const stack = [frame('http://h/a.js'), frame('<anonymous>'), frame('native')]
  expect(await firstSite(server, stack)).toBeNull()
})

it('still throws for a project URL the module graph cannot map, and for a frame without a position', async () => {
  const none = serverWith(() => undefined)
  await expect(
    firstSite(none, [frame('<anonymous>'), frame('http://h/src/card.tsx')]),
  ).rejects.toThrow('http://h/src/card.tsx')
  const map = { version: 3, sources: ['/repo/src/card.tsx'], names: [], mappings: 'AAAA' }
  const mapped = serverWith(() => ({ file: '/repo/src/card.tsx', transformResult: { map } }))
  const noLine = { ...frame('http://h/src/card.tsx'), line1: null }
  await expect(firstSite(mapped, [noLine])).rejects.toThrow('http://h/src/card.tsx')
})

it('returns the first project frame, skipping unmapped ones before it', async () => {
  const map = { version: 3, sources: ['/repo/src/card.tsx'], names: [], mappings: 'AAAA' }
  const server = serverWith((url?: unknown) =>
    url === '/src/card.tsx' ? { file: '/repo/src/card.tsx', transformResult: { map } } : undefined,
  )
  expect(await firstSite(server, [frame('x'), frame('http://h/src/card.tsx')])).toEqual({
    file: 'src/card.tsx',
    line: 1,
  })
})

function reply() {
  const res = { headers: {} as Record<string, string>, body: '' }
  const out = {
    setHeader: (k: string, v: string) => void (res.headers[k] = v),
    end: (b: string) => void (res.body = b),
  } as unknown as ServerResponse
  return { res, out, json: () => JSON.parse(res.body) as unknown }
}

it('answers the locate lookup as JSON, and looks up at most 50 names', () => {
  const ask = (names: string) => {
    const r = reply()
    locateHandler(process.cwd(), ['src'])(
      { url: `/?names=${names}` } as IncomingMessage,
      r.out,
      vi.fn(),
    )
    return r
  }
  const first = ask('GrabMeOverlay')
  expect(first.res.headers['content-type']).toBe('application/json')
  expect(first.json()).toEqual({
    GrabMeOverlay: [{ file: 'src/overlay.tsx', line: expect.any(Number) }],
  })
  const names = Array.from({ length: 60 }, (_, i) => `N${i}`)
  names[55] = 'GrabMeOverlay'
  expect(ask(names.join(',')).json()).toEqual({})
})

it('hands a locate failure to Vite as an error, so the client warns', () => {
  const next = vi.fn()
  locateHandler('/does/not/exist', ['nowhere'])(
    { url: '/?names=A' } as IncomingMessage,
    reply().out,
    next,
  )
  expect(next).toHaveBeenCalledOnce()
})

it('answers frames with the first project site, and hands a lookup failure to Vite', async () => {
  const req = (b: unknown) =>
    Readable.from([Buffer.from(JSON.stringify(b))]) as unknown as IncomingMessage
  const none = serverWith(() => undefined)
  const r = reply()
  await framesHandler(none)(req({ frames: [] }), r.out, vi.fn())
  expect(r.json()).toBeNull()
  const next = vi.fn()
  await framesHandler(none)(req({ frames: [frame('http://h/a.tsx')] }), r.out, next)
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('no source map') }),
  )
})

it('hands a failure while answering to Vite too, instead of an unhandled rejection', async () => {
  const req = Readable.from([Buffer.from('{"frames":[]}')]) as unknown as IncomingMessage
  const boom = new Error('socket closed')
  const res = {
    setHeader: () => {
      throw boom
    },
  } as unknown as ServerResponse
  const next = vi.fn()
  await framesHandler(serverWith(() => undefined))(req, res, next)
  expect(next).toHaveBeenCalledWith(boom)
})

const requestOf = (chunks: Buffer[]) => Readable.from(chunks) as unknown as IncomingMessage

it('rejects a request body over 1 MB to Vite as an error, without answering', async () => {
  const r = reply()
  const next = vi.fn()
  const big = Buffer.alloc(1024 * 1024 + 1, 'a')
  await framesHandler(serverWith(() => undefined))(requestOf([big]), r.out, next)
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('1 MB') }),
  )
  expect(r.res.body).toBe('')
})

it('maps at most the first 50 frames', async () => {
  const getModuleByUrl = vi.fn(() => undefined)
  const frames = Array.from({ length: 60 }, (_, i) => frame(`http://h/${i}.tsx`))
  await framesHandler(serverWith(getModuleByUrl))(
    requestOf([Buffer.from(JSON.stringify({ frames }))]),
    reply().out,
    vi.fn(),
  )
  expect(getModuleByUrl).toHaveBeenCalledTimes(50)
})
