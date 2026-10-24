import { afterEach, expect, it } from 'vitest'
import { install } from './bridge.js'

const g = globalThis as { __GRAB_ME__?: unknown }
afterEach(() => delete g.__GRAB_ME__)

const handlers = {
  arm: () => {},
  pick: () => Promise.resolve('picked'),
  screen: () => Promise.reject(new Error('no root')),
  at: (x: number, y: number) => Promise.resolve(`at ${x},${y}`),
}
const settle = () => new Promise((r) => setTimeout(r, 0))

it('installs itself on globalThis and runs each call as a job that is polled', async () => {
  const bridge = install(handlers)
  expect(g.__GRAB_ME__).toBe(bridge)
  const id = bridge.at(1, 2)
  expect(bridge.poll(id)).toEqual({ done: false })
  await settle()
  expect(bridge.poll(id)).toEqual({ done: true, text: 'at 1,2' })
  // A finished job is answered once.
  expect(bridge.poll(id)).toBeNull()
})

it('reports a failed job’s error and arms without a job', async () => {
  let armed = false
  const bridge = install({ ...handlers, arm: () => void (armed = true) })
  const id = bridge.screen()
  await settle()
  expect(bridge.poll(id)).toEqual({ done: true, error: 'no root' })
  bridge.arm()
  expect(armed).toBe(true)
  bridge.pick()
})

it('keeps the last grab across a reinstall (Fast Refresh remounts the overlay)', () => {
  install(handlers).last = '<grab-me/>'
  expect(install(handlers).last).toBe('<grab-me/>')
})

it('reports a thrown non-Error as text', async () => {
  const bridge = install({ ...handlers, screen: () => Promise.reject('plain') })
  const id = bridge.screen()
  await settle()
  expect(bridge.poll(id)).toEqual({ done: true, error: 'plain' })
})
