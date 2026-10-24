import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { GrabMe, grabMeMenuItem } from './index.js'

vi.mock('react-native', () => import('../../test/react-native.js'))

const g = globalThis as {
  __DEV__?: boolean
  __GRAB_ME__?: { arm(): void }
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
g.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => {
  delete g.__DEV__
  delete g.__GRAB_ME__
})

// The development branch reaches the overlay through a plain require, which Metro resolves
// and drops from release bundles; it is exercised by the overlay's own tests and in an app.
async function render(dev: boolean) {
  g.__DEV__ = dev
  let r!: ReactTestRenderer
  await act(async () => {
    r = create(<GrabMe>{'app'}</GrabMe>)
  })
  return r.toJSON()
}

it('renders only the app in a release build', async () => {
  expect(await render(false)).toBe('app')
})

it('offers an Expo dev menu item that arms the picker, when one is mounted', () => {
  expect(grabMeMenuItem).toMatchObject({ name: 'Grab me Native', shouldCollapse: true })
  grabMeMenuItem.callback()
  const arm = vi.fn()
  g.__GRAB_ME__ = { arm }
  grabMeMenuItem.callback()
  expect(arm).toHaveBeenCalledOnce()
})
