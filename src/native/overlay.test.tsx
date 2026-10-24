import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fiber, text } from '../../test/fibers.js'
import { menu, modules } from '../../test/react-native.js'
import type { Bridge } from './bridge.js'
import type { HostFiber } from './host.js'
import { NativeOverlay, step, toastFor } from './overlay.js'

vi.mock('react-native', () => import('../../test/react-native.js'))

const g = globalThis as {
  __GRAB_ME__?: Bridge
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
g.IS_REACT_ACT_ENVIRONMENT = true

// A card with a label; the hit test answers the label wherever the finger is.
const box = (y: number) => ({ x: 0, y, width: 100, height: 20 })
let label: HostFiber
let card: HostFiber
function world() {
  label = fiber({ type: 'RCTText', box: box(10), children: [text('Open')] })
  card = fiber({ box: box(0), children: [label] })
  fiber({ children: [card] })
  g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map([
      [
        1,
        {
          rendererConfig: {
            getInspectorDataForViewAtPoint: (
              _root: unknown,
              _x: number,
              y: number,
              cb: (d: unknown) => void,
            ) =>
              cb({
                hierarchy: [{}],
                frame: { left: 0, top: 10, width: 40, height: 18 },
                closestPublicInstance: y < 500 ? { __internalInstanceHandle: label } : undefined,
              }),
          },
        },
      ],
    ]),
  }
}

let copied: string[]
beforeEach(() => {
  world()
  copied = []
  modules.Clipboard = { setString: (s: string) => void copied.push(s) }
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ stack: [] }))),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete modules.Clipboard
  delete modules.RNCClipboard
  delete g.__GRAB_ME__
})

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)))

async function mount(props: Parameters<typeof NativeOverlay>[0] = {}) {
  let r!: ReactTestRenderer
  await act(async () => {
    r = create(<NativeOverlay {...props}>{'app'}</NativeOverlay>, {
      // The app root's ref is a host view whose fiber is the tree above.
      createNodeMock: () => ({ __internalInstanceHandle: card.return }),
    })
  })
  return r
}

// The mock renders host views as strings, which the renderer's typings do not expect.
const is = (n: ReactTestInstance, type: string) => (n.type as unknown) === type
const all = (r: ReactTestRenderer, type: string) => r.root.findAll((n) => is(n, type))

const layer = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.onResponderRelease === 'function')[0]
const button = (r: ReactTestRenderer, label: string) =>
  all(r, 'Pressable').find((n) => n.findAll((t) => is(t, 'Text'))[0]?.props.children === label)
const texts = (r: ReactTestRenderer) =>
  all(r, 'Text')
    .map((t) => t.props.children as string)
    .join(' | ')
const touch = (y: number) => ({ nativeEvent: { pageX: 5, pageY: y } })

describe('NativeOverlay', () => {
  it('renders the app, and the picker only once armed (dev menu or bridge)', async () => {
    const r = await mount()
    expect(all(r, 'View')[0]?.props.children).toBe('app')
    expect(layer(r)).toBeUndefined()
    expect(menu.map(([title]) => title)).toEqual(['Grab me Native'])
    await act(() => menu[0]?.[1]())
    expect(layer(r)).toBeDefined()
    expect(texts(r)).toContain('grab-me: drag, lift to copy')
    expect(g.__GRAB_ME__?.clipboard).toBe(true)
  })

  it('outlines what is under the finger, copies it on lift, and remembers it', async () => {
    const r = await mount({ stopAfter: [] })
    await act(() => g.__GRAB_ME__?.arm())
    await act(() => layer(r)?.props.onResponderMove(touch(12)))
    expect(texts(r)).toContain('Text 40×18')
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    await settle()
    expect(copied[0]).toContain('<Text> "Open"')
    expect(g.__GRAB_ME__?.last).toBe(copied[0])
    expect(texts(r)).toContain('Copied Text 40×18')
  })

  it('walks up to the parent and back, and adds a second element with +', async () => {
    const r = await mount()
    await act(() => g.__GRAB_ME__?.arm())
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    await act(() => button(r, '↑')?.props.onPress())
    await settle()
    expect(copied.at(-1)).toContain('<View> "Open"')
    await act(() => button(r, '↓')?.props.onPress())
    await settle()
    expect(copied.at(-1)).toContain('<Text> "Open"')
    await act(() => button(r, '+')?.props.onPress())
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    await settle()
    expect(copied.at(-1)).toContain('[2] <Text>')
    expect(texts(r)).toContain('Copied 2 elements')
  })

  it('ignores a lift over nothing, and closes with ✕', async () => {
    const r = await mount()
    await act(() => g.__GRAB_ME__?.arm())
    await act(() => layer(r)?.props.onResponderRelease(touch(900)))
    expect(copied).toEqual([])
    await act(() => button(r, '✕')?.props.onPress())
    expect(layer(r)).toBeUndefined()
  })

  it('hands the grab to onGrab instead of the clipboard', async () => {
    const onGrab = vi.fn()
    const r = await mount({ onGrab })
    await act(() => g.__GRAB_ME__?.arm())
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    expect(onGrab).toHaveBeenCalledOnce()
    expect(copied).toEqual([])
  })

  it('says so when the app has no clipboard module, and uses the community one when it has', async () => {
    delete modules.Clipboard
    const r = await mount()
    expect(g.__GRAB_ME__?.clipboard).toBe(false)
    await act(() => g.__GRAB_ME__?.arm())
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    expect(texts(r)).toContain('No clipboard module; snippet logged')
    const async: string[] = []
    modules.RNCClipboard = {
      setStringAsync: (s: string) => Promise.resolve(void async.push(s)),
    }
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    expect(async).toHaveLength(1)
  })

  it('serves the CLI: pick waits for the tap, at grabs a point, screen reads the tree', async () => {
    const r = await mount()
    const bridge = g.__GRAB_ME__ as Bridge
    let pick = 0
    await act(() => void (pick = bridge.pick()))
    await act(() => layer(r)?.props.onResponderRelease(touch(12)))
    await settle()
    expect(bridge.poll(pick)?.text).toContain('<Text> "Open"')

    const at = bridge.at(5, 12)
    await settle()
    expect(bridge.poll(at)?.text).toContain('<Text> "Open"')
    const nothing = bridge.at(5, 900)
    await settle()
    expect(bridge.poll(nothing)?.error).toBe('grab-me: nothing at 5, 900')

    const screen = bridge.screen()
    await settle()
    expect(bridge.poll(screen)?.text).toContain('y10 "Open"')
  })

  it('answers screen with an error before the root is mounted', async () => {
    let r!: ReactTestRenderer
    await act(async () => {
      r = create(<NativeOverlay />, { createNodeMock: () => null })
    })
    const id = (g.__GRAB_ME__ as Bridge).screen()
    await settle()
    expect(g.__GRAB_ME__?.poll(id)?.error).toBe('grab-me: the app root is not mounted')
    await act(() => r.unmount())
  })
})

describe('step', () => {
  const hit = (f: HostFiber) => ({ fiber: f, box: { x: 0, y: 0, w: 1, h: 1 } })

  it('climbs to the measured parent and back down, but not past the ends', () => {
    const up = step([hit(label)], true)
    expect(up.map((h) => h.fiber)).toEqual([label, card])
    expect(step(up, false).map((h) => h.fiber)).toEqual([label])
    expect(step([hit(label)], false).map((h) => h.fiber)).toEqual([label])
    // The tree's root has no host parent; an unmeasured parent is not climbed to.
    const root = card.return as HostFiber
    expect(step([hit(root)], true)).toHaveLength(1)
    expect(step([], true)).toEqual([])
  })

  it('words the toast', () => {
    const one = { fiber: label, box: { x: 0, y: 0, w: 40, h: 18 } }
    expect(toastFor([one], true)).toBe('Copied Text 40×18')
    expect(toastFor([one, one], true)).toBe('Copied 2 elements')
    expect(toastFor([one], false)).toBe('No clipboard module; snippet logged')
  })
})
