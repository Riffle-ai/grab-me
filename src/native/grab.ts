// The native grab: host views → the same kind of reference the web grab makes, with the
// JSX call site and owners mapped through Metro, and styles named by the app's tokens.
import { Appearance, Dimensions, Platform } from 'react-native'
import { ownerName, ownersOf, type Fiber } from '../core/fiber.js'
import type { Site } from '../core/resolver.js'
import { resolve, sitesOf } from './metro.js'
import {
  attrsOf,
  boxOf,
  childHosts,
  props,
  stylesOf,
  tagOf,
  textOf,
  tokenMap,
  type Box,
  type HostFiber,
  type NativeStyles,
  type Tokens,
} from './host.js'

export interface NativeGrabOptions {
  /** The app's design tokens by kind, read at grab time (themes change). */
  tokens?: () => Tokens
  /** The theme's name; the system colour scheme by default. */
  theme?: () => string
  /** The current route, e.g. expo-router's pathname. */
  route?: () => string | undefined
  /** Path prefixes of library components, shown until two components outside them. */
  stopAfter?: string[]
}

export interface NativeOwner {
  name: string
  /** Where this component is rendered: the JSX call in its parent. */
  at: string
}
export interface NativeElement {
  tag: string
  attrs: Record<string, string>
  text: string
  jsx?: Site
  owners: NativeOwner[]
  styles: NativeStyles
}
export interface NativeGrabResult {
  platform: string
  route?: string
  window: { w: number; h: number }
  theme: string
  elements: NativeElement[]
  warnings: string[]
}

const MAX_SHOWN = 10
const at = (s: Site) => `${s.file}${s.line ? `:${s.line}` : ''}`

function head(opts: NativeGrabOptions, warnings: Set<string>) {
  const { width, height } = Dimensions.get('window')
  const route = opts.route?.()
  return {
    platform: Platform.OS,
    ...(route ? { route } : {}),
    window: { w: Math.round(width), h: Math.round(height) },
    theme: opts.theme?.() ?? Appearance.getColorScheme() ?? 'light',
    warnings: [...warnings].sort(),
  }
}

const under = (site: Site, prefixes: string[]) => prefixes.some((p) => site.file.startsWith(p))

/**
 * Owners with a call site in the project; library internals (routers, screens) drop out, a
 * recursive component shows once, and the list stops after two owners outside `stopAfter`.
 */
export function pick(
  chain: Fiber[],
  sites: Array<Site | null>,
  stopAfter: string[],
): NativeOwner[] {
  const out: NativeOwner[] = []
  let app = 0
  const full = () => app >= 2 || out.length >= MAX_SHOWN
  chain.forEach((o, i) => {
    const site = sites[i]
    const name = ownerName(o)
    if (!site || full() || out.at(-1)?.name === name) return
    out.push({ name, at: at(site) })
    if (!under(site, stopAfter)) app++
  })
  return out
}

/** A host view and the components above it, nearest first; server owners have no fiber. */
const chainOf = (f: HostFiber, max = 40): Fiber[] =>
  [f, ...ownersOf(f).filter((o): o is Fiber => 'tag' in o)].slice(0, max)

/** Every fiber's call site, in one request; fibers shared between chains are asked once. */
async function sitesFor(chains: Fiber[][], warnings: Set<string>) {
  const fibers = [...new Set(chains.flat())]
  let sites: Array<Site | null>
  try {
    sites = await resolve(sitesOf(fibers))
  } catch (e) {
    warnings.add(`source frames: ${e instanceof Error ? e.message : String(e)}`)
    sites = fibers.map(() => null)
  }
  const byFiber = new Map(fibers.map((f, i) => [f, sites[i] ?? null]))
  return chains.map((c) => c.map((f) => byFiber.get(f) ?? null))
}

export async function grab(
  els: Array<{ fiber: HostFiber; box: Box }>,
  opts: NativeGrabOptions = {},
): Promise<NativeGrabResult> {
  const warnings = new Set<string>()
  const map = tokenMap(opts.tokens?.() ?? {})
  const chains = els.map((e) => chainOf(e.fiber))
  const sites = await sitesFor(chains, warnings)
  const elements = els.map((e, n): NativeElement => {
    const chain = chains[n] ?? []
    const own = sites[n] ?? []
    // A host view is written inside React Native's own components (Text, Pressable); its
    // jsx is the first call in the project, and the owners start above that.
    const j = own.findIndex(Boolean)
    const jsx = j >= 0 ? own[j] : null
    return {
      tag: tagOf(e.fiber),
      attrs: attrsOf(e.fiber),
      text: textOf(e.fiber),
      ...(jsx ? { jsx } : {}),
      owners: pick(chain.slice(j + 1), own.slice(j + 1), opts.stopAfter ?? []),
      styles: stylesOf(e.fiber, e.box, map),
    }
  })
  return { ...head(opts, warnings), elements }
}

// The screen: every text and every labelled control in view, so an agent can read what is
// on screen and where each piece is written without a screenshot.

export interface ScreenItem {
  kind: 'text' | 'control'
  text: string
  box: Box
  owner?: string
  jsx?: Site
}
export interface ScreenResult extends Omit<NativeGrabResult, 'elements'> {
  items: ScreenItem[]
}

/** A screen a native stack keeps mounted under the top one; inactive screens are hidden. */
const hidden = (f: HostFiber) =>
  (f.type === 'RNSScreen' && props(f).activityState === 0) ||
  props(f).accessibilityElementsHidden === true ||
  props(f).importantForAccessibility === 'no-hide-descendants'

const sized = (b: Box) => b.w > 0 && b.h > 0
const inside = (b: Box, w: number, h: number) =>
  b.x < w && b.y < h && b.x + b.w > 0 && b.y + b.h > 0

export function onScreen(b: Box | null, w: number, h: number): b is Box {
  return !!b && sized(b) && inside(b, w, h)
}

function item(f: HostFiber): Omit<ScreenItem, 'box'> | null {
  const label = props(f).accessibilityLabel ?? props(f)['aria-label']
  if (f.type === 'RCTText') return { kind: 'text', text: textOf(f) }
  if (props(f).accessible && typeof label === 'string') return { kind: 'control', text: label }
  return null
}

interface Found {
  fiber: HostFiber
  item: Omit<ScreenItem, 'owner' | 'jsx'>
}

interface Window {
  w: number
  h: number
}

// A text already said by the control around it (a chip's label) is left out.
function found(c: HostFiber, it: ReturnType<typeof item>, labels: string[], win: Window) {
  if (!it?.text) return null
  const repeated = it.kind === 'text' && labels.some((l) => l.includes(it.text))
  const box = repeated ? null : boxOf(c)
  return onScreen(box, win.w, win.h) ? { fiber: c, item: { ...it, box } } : null
}

/** A control's label is said for everything below it. */
const said = (it: ReturnType<typeof item>, labels: string[]) =>
  it?.kind === 'control' ? [...labels, it.text] : labels

export function collect(f: HostFiber, labels: string[], win: Window, out: Found[] = []) {
  for (const c of childHosts(f)) {
    if (hidden(c)) continue
    const it = item(c)
    const hit = found(c, it, labels, win)
    if (hit) out.push(hit)
    collect(c, said(it, labels), win, out)
  }
  return out
}

/** The first call in the project outside the library prefixes, and the component it is in. */
export function place(chain: Fiber[], sites: Array<Site | null>, stopAfter: string[]) {
  const k = sites.findIndex((s) => s && !stopAfter.some((p) => s.file.startsWith(p)))
  const i = k >= 0 ? k : sites.findIndex(Boolean)
  const site = sites[i]
  const within = chain[i]?._debugOwner
  return site ? { jsx: site, ...(within ? { owner: ownerName(within) } : {}) } : {}
}

export async function screen(root: HostFiber, opts: NativeGrabOptions = {}): Promise<ScreenResult> {
  const warnings = new Set<string>()
  const { width, height } = Dimensions.get('window')
  const shown = collect(root, [], { w: width, h: height })
  const chains = shown.map((x) => chainOf(x.fiber, 12))
  const sites = await sitesFor(chains, warnings)
  const items = shown.map(({ item }, n) => ({
    ...item,
    ...place(chains[n] ?? [], sites[n] ?? [], opts.stopAfter ?? []),
  }))
  items.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  return { ...head(opts, warnings), items }
}
