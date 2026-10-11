// Turns DOM nodes into a structured reference: what each node is, where its JSX lives, which
// components own it and which tokens it wears. Works in any build; without React's dev
// internals or a resolver it keeps what the DOM alone can say.
import { callSite, fiberOf, isFiber, ownerName, owners, type Owner } from './fiber.js'
import { describe, styles, type Described, type Styles } from './describe.js'
import type { Definition, Resolver, Site } from './resolver.js'
import { theme } from './tokens.js'

export type { Resolver } from './resolver.js'

export interface GrabOptions {
  resolver?: Resolver
  /** Path prefixes of library components, shown until two components outside them. */
  stopAfter?: string[]
}
export interface Shown {
  name: string
  server: boolean
  at?: string
}
export interface GrabbedElement extends Described {
  jsx?: Site
  owners: Shown[]
  styles: Styles
}
export interface GrabResult {
  url: string
  viewport: { w: number; h: number }
  theme: string
  elements: GrabbedElement[]
  warnings: string[]
}

const SHOW_OWNERS = 6
const MAX_SHOWN = 10

type Located = Required<Shown>

function located(chain: Owner[], defs: Record<string, Definition[]>): Located[] {
  const out: Located[] = []
  for (const o of chain) {
    const name = ownerName(o)
    const at = defs[name]?.map((d) => `${d.file}:${d.line}`).join(' | ')
    // Recursive components (rows in rows) appear once; framework internals have no definition.
    if (at && out.at(-1)?.name !== name) out.push({ name, server: !isFiber(o), at })
  }
  return out
}

function cut(list: Located[], stopAfter: string[]): Located[] {
  const out: Located[] = []
  let app = 0
  for (const x of list) {
    out.push(x)
    if (!stopAfter.some((p) => x.at.startsWith(p))) app++
    if (app === 2 || out.length === MAX_SHOWN) break
  }
  return out
}

export function pick(
  chain: Owner[],
  defs: Record<string, Definition[]>,
  stopAfter: string[],
): Shown[] {
  const ours = cut(located(chain, defs), stopAfter)
  if (ours.length) return ours
  return chain.slice(0, SHOW_OWNERS).map((o) => ({ name: ownerName(o), server: !isFiber(o) }))
}

async function attempt<T>(what: string, warnings: Set<string>, fallback: T, run: () => Promise<T>) {
  try {
    return await run()
  } catch (e) {
    warnings.add(`${what}: ${e instanceof Error ? e.message : String(e)}`)
    return fallback
  }
}

async function sources(el: Element, chain: Owner[], resolver: Resolver, warnings: Set<string>) {
  const site = callSite(fiberOf(el)?._debugStack ?? null)
  return Promise.all([
    chain.length
      ? attempt('component definitions', warnings, {}, () => resolver.locate(chain.map(ownerName)))
      : {},
    site
      ? attempt('source frames', warnings, null, () => resolver.frames(site.frames, site.server))
      : null,
  ])
}

async function element(
  el: Element,
  opts: GrabOptions,
  warnings: Set<string>,
): Promise<GrabbedElement> {
  const chain = owners(el)
  const [defs, jsx] = opts.resolver ? await sources(el, chain, opts.resolver, warnings) : [{}, null]
  return {
    ...describe(el),
    ...(jsx ? { jsx } : {}),
    owners: pick(chain, defs, opts.stopAfter ?? []),
    styles: styles(el),
  }
}

export async function grab(els: Element[], opts: GrabOptions = {}): Promise<GrabResult> {
  const warnings = new Set<string>()
  const elements = await Promise.all(els.map((el) => element(el, opts, warnings)))
  return {
    url: `${location.pathname}${location.search}`,
    viewport: { w: innerWidth, h: innerHeight },
    theme: theme(),
    elements,
    warnings: [...warnings].sort(),
  }
}
