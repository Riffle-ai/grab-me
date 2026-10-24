import { expect, it } from 'vitest'
import { USAGE } from './commands.js'
import { RAYCAST_HELP, main, type Deps } from './main.js'

function deps(answer: unknown, env: Record<string, string> = {}) {
  const seen = { port: '', device: undefined as string | undefined, closed: false }
  const d: Deps = {
    io: { sleep: () => Promise.resolve(), now: () => 0, note: () => {} },
    env,
    connect: (port, device) => {
      Object.assign(seen, { port, device })
      return Promise.resolve({
        eval: <T>() => Promise.resolve(answer as T),
        close: () => void (seen.closed = true),
      })
    },
    raycast: (dir) => `${dir ?? '~/.config/raycast/scripts'}/grab-me-arm.sh`,
  }
  return { d, seen }
}

it('runs a command against the app on the given port and device, then disconnects', async () => {
  const { d, seen } = deps(true)
  await expect(main(['arm', '--port', '8083', '--device', 'Pro'], d)).resolves.toBe(
    'grab-me: armed',
  )
  expect(seen).toEqual({ port: '8083', device: 'Pro', closed: true })
})

it('takes the port from RCT_METRO_PORT, else 8081', async () => {
  const a = deps(true, { RCT_METRO_PORT: '9090' })
  await main(['arm'], a.d)
  expect(a.seen.port).toBe('9090')
  const b = deps(true)
  await main(['arm'], b.d)
  expect(b.seen.port).toBe('8081')
})

it('disconnects when the command fails', async () => {
  const { d, seen } = deps(false)
  await expect(main(['arm'], d)).rejects.toThrow('this app has no grab-me')
  expect(seen.closed).toBe(true)
})

it('prints the usage for no or an unknown command', async () => {
  await expect(main([], deps(null).d)).rejects.toThrow(USAGE)
  await expect(main(['nope'], deps(null).d)).rejects.toThrow(USAGE)
})

it('writes the Raycast script without connecting, and says what to do in Raycast', async () => {
  await expect(main(['raycast', '/tmp/s'], deps(null).d)).resolves.toBe(
    `wrote /tmp/s/grab-me-arm.sh\n${RAYCAST_HELP}`,
  )
})
