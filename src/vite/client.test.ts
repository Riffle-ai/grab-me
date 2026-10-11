import { afterEach, expect, it, vi } from 'vitest'
import { viteResolver } from './client.js'

afterEach(() => vi.unstubAllGlobals())

it('posts frames to the plugin and reads the site back', async () => {
  const fetch = vi.fn(async () => Response.json({ file: 'src/a.tsx', line: 3 }))
  vi.stubGlobal('fetch', fetch)
  const frame = { file: 'http://h/a.tsx', methodName: 'A', arguments: [], line1: 1, column1: 1 }
  expect(await viteResolver().frames([frame], false)).toEqual({ file: 'src/a.tsx', line: 3 })
  expect(fetch).toHaveBeenCalledWith(
    '/__grab-me/frames',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ frames: [frame] }) }),
  )
})

it('asks for each component name once, and throws when the plugin answers an error', async () => {
  const fetch = vi.fn(async () => new Response('', { status: 500 }))
  vi.stubGlobal('fetch', fetch)
  await expect(viteResolver().locate(['A', 'B', 'A'])).rejects.toThrow(
    '/__grab-me/locate answered 500',
  )
  expect(fetch).toHaveBeenCalledWith('/__grab-me/locate?names=A%2CB')
})
