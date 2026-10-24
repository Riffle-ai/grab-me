// What React Native's dev renderer keeps on a host view: the fiber under a point, its props,
// its text, and the style it was given (React Native has no computed styles; the flattened
// style prop is what the view wears).
import { StyleSheet } from 'react-native'
import type { Fiber } from '../core/fiber.js'
import type { Styled } from '../core/tokens.js'

export interface HostFiber extends Fiber {
  type: string
  memoizedProps: Record<string, unknown> | string | null
  child: HostFiber | null
  sibling: HostFiber | null
  return: HostFiber | null
  stateNode: { canonical?: { publicInstance?: PublicInstance } } | null
}
interface PublicInstance {
  __internalInstanceHandle?: HostFiber
  getBoundingClientRect?: () => { x: number; y: number; width: number; height: number }
}
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const HOST_COMPONENT = 5
const HOST_TEXT = 6

export const isHost = (f: HostFiber | null) => f?.tag === HOST_COMPONENT
export const props = (f: HostFiber) =>
  (typeof f.memoizedProps === 'object' && f.memoizedProps) || ({} as Record<string, unknown>)

interface Renderer {
  rendererConfig?: {
    getInspectorDataForViewAtPoint?: (
      view: unknown,
      x: number,
      y: number,
      cb: (data: {
        hierarchy: unknown[]
        frame: { left: number; top: number; width: number; height: number }
        closestPublicInstance?: PublicInstance
      }) => void,
    ) => void
  }
}
interface DevtoolsHook {
  renderers?: Map<number, Renderer>
}

const hook = () =>
  (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__

export interface Hit {
  fiber: HostFiber
  box: Box
}

/** The host view under (x, y) inside `root`, the same lookup RN's Element Inspector does. */
export function hitTest(root: unknown, x: number, y: number): Promise<Hit | null> {
  const renderers = [...(hook()?.renderers?.values() ?? [])]
  const find = renderers.map((r) => r.rendererConfig?.getInspectorDataForViewAtPoint).find(Boolean)
  if (!find) return Promise.resolve(null)
  return new Promise((done) =>
    find(root, x, y, (d) => {
      const fiber = d.closestPublicInstance?.__internalInstanceHandle
      const { left, top, width, height } = d.frame
      done(fiber ? { fiber, box: { x: left, y: top, w: width, h: height } } : null)
    }),
  )
}

export function boxOf(f: HostFiber): Box | null {
  const r = f.stateNode?.canonical?.publicInstance?.getBoundingClientRect?.()
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
}

/** The fiber a host view's public instance (a ref) belongs to. */
export const fiberOfInstance = (i: unknown) =>
  (i as PublicInstance | null)?.__internalInstanceHandle ?? null

export function parentHost(f: HostFiber): HostFiber | null {
  let p = f.return
  while (p && !isHost(p)) p = p.return
  return p
}

/** The nearest host fibers below `f`: its children in the native view tree. */
export function* childHosts(f: HostFiber | null): Generator<HostFiber> {
  for (let c = f?.child ?? null; c; c = c.sibling) {
    if (isHost(c)) yield c
    else yield* childHosts(c)
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

function texts(f: HostFiber | null, out: string[]) {
  for (let c = f?.child ?? null; c; c = c.sibling) {
    if (c.tag === HOST_TEXT && typeof c.memoizedProps === 'string') out.push(c.memoizedProps)
    else texts(c, out)
  }
  return out
}

export const textOf = (f: HostFiber) =>
  clip(texts(f, []).join(' ').replace(/\s+/g, ' ').trim(), 100)

/** "RCTView" → "View": the name a React Native developer writes. */
export const tagOf = (f: HostFiber) =>
  f.type
    .replace(/^RCT/, '')
    .replace(/^RNSVG/, 'Svg.')
    .replace(/^RNS(?=Screen)/, '')

const ATTRS = [
  'testID',
  'nativeID',
  'accessibilityLabel',
  'aria-label',
  'role',
  'accessibilityRole',
]

export function attrsOf(f: HostFiber): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of ATTRS) {
    const v = props(f)[a]
    if (typeof v === 'string' && v) out[a] = clip(v, 100)
  }
  return out
}

// Styles

export type Kind = 'color' | 'space' | 'radius' | 'text'
/** Design tokens by kind, as nested objects; leaves are values (`{ surface: { card: '#fff' } }`). */
export type Tokens = Partial<Record<Kind, object>>

export interface NativeStyles {
  box: { w: number; h: number }
  font?: { size: Styled; lineHeight?: string; family?: string; weight?: string }
  color?: Styled
  bg?: Styled
  padding?: [Styled, Styled, Styled, Styled]
  layout?: { direction: string; gap?: Styled; align?: string; justify?: string }
  border?: { width: string; color?: Styled }
  radius?: Styled
  opacity?: string
}

const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : String(v))

function leaves(o: object, path: string, out: Array<[string, unknown]>) {
  for (const [k, v] of Object.entries(o)) {
    const p = path ? `${path}.${k}` : k
    if (v && typeof v === 'object') leaves(v, p, out)
    else out.push([p, v])
  }
  return out
}

/** value → token name, per kind; the first token with a value wins. */
export function tokenMap(tokens: Tokens): Map<string, string> {
  const map = new Map<string, string>()
  for (const [kind, tree] of Object.entries(tokens)) {
    for (const [name, v] of leaves(tree as object, '', [])) {
      const key = `${kind}:${norm(v)}`
      if (!map.has(key)) map.set(key, name)
    }
  }
  return map
}

const styled = (map: Map<string, string>, kind: Kind, v: unknown): Styled => {
  const token = map.get(`${kind}:${norm(v)}`)
  return token ? { value: String(v), token } : { value: String(v) }
}

type Style = Record<string, unknown>
const first = (s: Style, ...keys: string[]) => keys.map((k) => s[k]).find((v) => v != null)

function padding(s: Style, map: Map<string, string>): NativeStyles['padding'] {
  const sides = [
    first(s, 'paddingTop', 'paddingVertical', 'padding'),
    first(s, 'paddingRight', 'paddingEnd', 'paddingHorizontal', 'padding'),
    first(s, 'paddingBottom', 'paddingVertical', 'padding'),
    first(s, 'paddingLeft', 'paddingStart', 'paddingHorizontal', 'padding'),
  ]
  if (sides.every((p) => p == null || p === 0)) return undefined
  return sides.map((p) => styled(map, 'space', p ?? 0)) as NativeStyles['padding']
}

function font(s: Style, map: Map<string, string>): NativeStyles['font'] {
  if (s.fontSize == null) return undefined
  return {
    size: styled(map, 'text', s.fontSize),
    ...(s.lineHeight != null ? { lineHeight: String(s.lineHeight) } : {}),
    ...(s.fontFamily ? { family: String(s.fontFamily) } : {}),
    ...(s.fontWeight ? { weight: String(s.fontWeight) } : {}),
  }
}

function layout(s: Style, map: Map<string, string>, isText: boolean): NativeStyles['layout'] {
  if (isText) return undefined
  const gap = first(s, 'gap', 'rowGap', 'columnGap')
  return {
    direction: String(s.flexDirection ?? 'column'),
    ...(gap != null ? { gap: styled(map, 'space', gap) } : {}),
    ...(s.alignItems ? { align: String(s.alignItems) } : {}),
    ...(s.justifyContent ? { justify: String(s.justifyContent) } : {}),
  }
}

const some = <T>(key: string, v: T | undefined) => (v === undefined ? {} : { [key]: v })

const colors = (s: Style, map: Map<string, string>) => ({
  ...some('color', s.color != null ? styled(map, 'color', s.color) : undefined),
  ...some('bg', s.backgroundColor != null ? styled(map, 'color', s.backgroundColor) : undefined),
})

function border(s: Style, map: Map<string, string>): NativeStyles['border'] {
  const width = first(s, 'borderWidth', 'borderTopWidth', 'borderBottomWidth')
  if (!width) return undefined
  const color = s.borderColor != null ? styled(map, 'color', s.borderColor) : undefined
  return { width: String(width), ...some('color', color) }
}

function radius(s: Style, map: Map<string, string>): Styled | undefined {
  const r = first(s, 'borderRadius', 'borderTopLeftRadius')
  return typeof r === 'number' && r ? styled(map, 'radius', r) : undefined
}

const opacity = (s: Style) => (s.opacity != null && s.opacity !== 1 ? String(s.opacity) : undefined)

export function stylesOf(f: HostFiber, box: Box, map: Map<string, string>): NativeStyles {
  const s = (StyleSheet.flatten(props(f).style as never) ?? {}) as Style
  return {
    box: { w: Math.round(box.w), h: Math.round(box.h) },
    ...some('font', font(s, map)),
    ...colors(s, map),
    ...some('padding', padding(s, map)),
    ...some('layout', layout(s, map, /Text$/.test(f.type))),
    ...some('border', border(s, map)),
    ...some('radius', radius(s, map)),
    ...some('opacity', opacity(s)),
  }
}
