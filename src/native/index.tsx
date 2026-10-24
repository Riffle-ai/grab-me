// grab-me for React Native. Wrap the app once; in a development build it adds the picker and
// the handle the `grab-me` CLI talks to, and in a release build it renders its children only:
// the overlay is required inside the __DEV__ branch, which Metro drops from release bundles.
import type { ReactNode } from 'react'
import type { GrabMeProps } from './overlay.js'

export type { GrabMeProps } from './overlay.js'
export type { NativeGrabOptions, NativeGrabResult, ScreenResult } from './grab.js'
export type { Tokens, Kind } from './host.js'

declare const __DEV__: boolean

/**
 * An item for Expo's dev menu that arms the picker. Expo keeps one list per app and each
 * registration replaces it, so the app adds this to its own list:
 * `registerDevMenuItems([...yourItems, grabMeMenuItem])` from 'expo-dev-menu'.
 */
export const grabMeMenuItem = {
  name: 'Grab me Native',
  callback: () => (globalThis as { __GRAB_ME__?: { arm(): void } }).__GRAB_ME__?.arm(),
  shouldCollapse: true,
}
declare const require: (id: string) => unknown

export function GrabMe(props: GrabMeProps): ReactNode {
  if (__DEV__) {
    const { NativeOverlay } = require('./overlay.js') as typeof import('./overlay.js')
    return <NativeOverlay {...props} />
  }
  return props.children
}
