import { afterEach, describe, expect, it, vi } from 'vitest'
import { component, fiber, text } from '../../test/fibers.js'
import {
  attrsOf,
  boxOf,
  childHosts,
  fiberOfInstance,
  hitTest,
  isHost,
  parentHost,
  props,
  stylesOf,
  tagOf,
  textOf,
  tokenMap,
} from './host.js'

vi.mock('react-native', () => import('../../test/react-native.js'))

const g = globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }
afterEach(() => delete g.__REACT_DEVTOOLS_GLOBAL_HOOK__)

describe('the fiber tree', () => {
  const label = fiber({ type: 'RCTText', children: [text('Open'), text('  now ')] })
  const wrapper = component('Chip', 1, undefined, [label])
  const row = fiber({ children: [wrapper, fiber({ type: 'RCTImageView' })] })

  it('tells host views from components, and reads props', () => {
    expect(isHost(row)).toBe(true)
    expect(isHost(wrapper)).toBe(false)
    expect(isHost(null)).toBe(false)
    expect(props(label)).toEqual({ children: undefined })
    expect(props(text('x'))).toEqual({})
  })

  it('walks to the nearest host parent and host children, past components', () => {
    expect(parentHost(label)).toBe(row)
    expect(parentHost(row)).toBeNull()
    expect([...childHosts(row)].map((f) => f.type)).toEqual(['RCTText', 'RCTImageView'])
    expect([...childHosts(null)]).toEqual([])
  })

  it('reads the text below a view, squashed and clipped', () => {
    expect(textOf(row)).toBe('Open now')
    expect(textOf(fiber({ children: [text('x'.repeat(120))] }))).toBe(`${'x'.repeat(100)}…`)
  })

  it('names views as a React Native developer writes them', () => {
    expect(tagOf(fiber({ type: 'RCTView' }))).toBe('View')
    expect(tagOf(fiber({ type: 'RNSVGCircle' }))).toBe('Svg.Circle')
    expect(tagOf(fiber({ type: 'RNSScreen' }))).toBe('Screen')
    expect(tagOf(fiber({ type: 'RNCSafeAreaView' }))).toBe('RNCSafeAreaView')
  })

  it('keeps the identifying props that are set', () => {
    const f = fiber({
      props: { testID: 'row', accessibilityLabel: 'a'.repeat(120), role: '', nativeID: 3 },
    })
    expect(attrsOf(f)).toEqual({ testID: 'row', accessibilityLabel: `${'a'.repeat(100)}…` })
  })
})

describe('boxes and instances', () => {
  it('measures a mounted host view and nothing else', () => {
    expect(boxOf(fiber({ box: { x: 1, y: 2, width: 3, height: 4 } }))).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    })
    expect(boxOf(fiber({}))).toBeNull()
  })

  it('finds the fiber behind a ref', () => {
    const f = fiber({})
    expect(fiberOfInstance({ __internalInstanceHandle: f })).toBe(f)
    expect(fiberOfInstance(null)).toBeNull()
  })
})

describe('hitTest', () => {
  it('asks the renderer the Element Inspector asks, and keeps the view and its frame', async () => {
    const hit = fiber({})
    const find = vi.fn((_root, _x, _y, cb: (d: unknown) => void) =>
      cb({
        hierarchy: [{}],
        frame: { left: 10, top: 20, width: 30, height: 40 },
        closestPublicInstance: { __internalInstanceHandle: hit },
      }),
    )
    g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([
        [1, {}],
        [2, { rendererConfig: { getInspectorDataForViewAtPoint: find } }],
      ]),
    }
    await expect(hitTest('root', 5, 6)).resolves.toEqual({
      fiber: hit,
      box: { x: 10, y: 20, w: 30, h: 40 },
    })
    expect(find.mock.calls[0]?.slice(0, 3)).toEqual(['root', 5, 6])
  })

  it('answers nothing for empty space, or without React DevTools’ hook', async () => {
    g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([
        [
          1,
          {
            rendererConfig: {
              getInspectorDataForViewAtPoint: (
                _r: unknown,
                _x: number,
                _y: number,
                cb: (d: unknown) => void,
              ) => cb({ hierarchy: [], frame: { left: 0, top: 0, width: 0, height: 0 } }),
            },
          },
        ],
      ]),
    }
    await expect(hitTest('root', 1, 1)).resolves.toBeNull()
    delete g.__REACT_DEVTOOLS_GLOBAL_HOOK__
    await expect(hitTest('root', 1, 1)).resolves.toBeNull()
  })
})

describe('styles', () => {
  const map = tokenMap({
    color: { surface: { card: '#FFFFFF' }, text: { primary: '#000000' }, border: { a: '#e0e2e5' } },
    space: { md: 12, lg: 16 },
    radius: { lg: 16 },
    text: { body: 16 },
  })
  const box = { x: 0, y: 0, w: 120.4, h: 40.6 }
  const styles = (type: string, style: unknown) =>
    stylesOf(fiber({ type, props: { style } }), box, map)

  it('maps values back to tokens, the first token of a value winning, case-insensitively', () => {
    expect(map.get('color:#ffffff')).toBe('surface.card')
    expect(map.get('space:16')).toBe('lg')
    expect(tokenMap({ space: { a: 4, b: 4 } }).get('space:4')).toBe('a')
  })

  it('describes a text: font and colour, no layout', () => {
    expect(
      styles('RCTText', [
        { fontSize: 16, lineHeight: 20, fontFamily: 'Inter', fontWeight: '500' },
        { color: '#000000' },
      ]),
    ).toEqual({
      box: { w: 120, h: 41 },
      font: {
        size: { value: '16', token: 'body' },
        lineHeight: '20',
        family: 'Inter',
        weight: '500',
      },
      color: { value: '#000000', token: 'text.primary' },
    })
    expect(styles('RCTText', { fontSize: 9 })).toEqual({
      box: { w: 120, h: 41 },
      font: { size: { value: '9' } },
    })
  })

  it('describes a view: background, padding by side, layout, border, radius and opacity', () => {
    expect(
      styles('RCTView', {
        backgroundColor: '#ffffff',
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderWidth: 1,
        borderColor: '#e0e2e5',
        borderRadius: 16,
        opacity: 0.5,
      }),
    ).toEqual({
      box: { w: 120, h: 41 },
      bg: { value: '#ffffff', token: 'surface.card' },
      padding: [
        { value: '12', token: 'md' },
        { value: '16', token: 'lg' },
        { value: '12', token: 'md' },
        { value: '16', token: 'lg' },
      ],
      layout: {
        direction: 'row',
        align: 'center',
        justify: 'space-between',
        gap: { value: '12', token: 'md' },
      },
      border: { width: '1', color: { value: '#e0e2e5', token: 'border.a' } },
      radius: { value: '16', token: 'lg' },
      opacity: '0.5',
    })
  })

  it('leaves out what a plain view does not set', () => {
    expect(
      styles('RCTView', { padding: 0, borderTopWidth: 2, opacity: 1, borderRadius: 0 }),
    ).toEqual({
      box: { w: 120, h: 41 },
      layout: { direction: 'column' },
      border: { width: '2' },
    })
    expect(styles('RCTView', undefined)).toEqual({
      box: { w: 120, h: 41 },
      layout: { direction: 'column' },
    })
  })
})
