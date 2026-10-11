// Reads what React 19's dev build keeps on a DOM node: the components that own it and the
// stack of its JSX call. Production builds keep neither; everything here then answers empty.

/** A client component's fiber, or the info React keeps for a server component. */
export type Owner = Fiber | ServerInfo
export interface Fiber {
  tag: number
  type: unknown
  _debugOwner?: Owner | null
  _debugStack?: Error | null
}
export interface ServerInfo {
  name: string
  env?: string
  owner?: Owner | null
  debugStack?: Error | null
}
export interface Frame {
  file: string
  methodName: string
  arguments: string[]
  line1: number | null
  column1: number | null
}

// Far enough to pass a framework's own router components.
const MAX_OWNERS = 40

export const isFiber = (o: Owner): o is Fiber => 'tag' in o

export function fiberOf(el: Element): Fiber | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  return key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null
}

export function typeName(type: unknown): string | null {
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || null
  }
  if (type && typeof type === 'object') {
    const t = type as { displayName?: string; render?: unknown; type?: unknown }
    return t.displayName || typeName(t.render) || typeName(t.type)
  }
  return null
}

export const ownerName = (o: Owner) => (isFiber(o) ? typeName(o.type) : o.name) ?? 'Anonymous'
const ownerParent = (o: Owner) => (isFiber(o) ? o._debugOwner : o.owner) ?? null

/** The components that rendered `el`, nearest first. */
export function owners(el: Element): Owner[] {
  const out: Owner[] = []
  let o = fiberOf(el)?._debugOwner ?? null
  while (o && out.length < MAX_OWNERS) {
    out.push(o)
    o = ownerParent(o)
  }
  return out
}

/** The nearest component name, for the hover label; no network. */
export function nearestName(el: Element): string | null {
  const o = fiberOf(el)?._debugOwner
  return o ? ownerName(o) : null
}

// "    at Name (url:line:col)" or "    at url:line:col"
const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/
const SERVER = /^about:\/\/React\/Server\//

function parse(line: string): Frame | null {
  const m = FRAME.exec(line)
  if (!m) return null
  const [, methodName = '', file = '', l, c] = m
  return { file, methodName, arguments: [], line1: Number(l), column1: Number(c) }
}

/** The first three frames of a stack, below React's own jsx frame. */
function frames(stack: string): Frame[] {
  const out: Frame[] = []
  for (const f of stack.split('\n').map(parse)) {
    if (!f || (out.length === 0 && /jsx|react-stack-top-frame/i.test(f.methodName))) continue
    out.push(f)
    if (out.length === 3) break
  }
  return out
}

/** The frames of a JSX call site, below React's own jsx frame. */
export function callSite(stack: Error | null): { frames: Frame[]; server: boolean } | null {
  // Past React's per-second budget a node gets a shared placeholder stack, not its own.
  if (!stack?.stack || stack.stack.includes('UnknownOwner')) return null
  const found = frames(stack.stack)
  if (!found.length) return null
  const server = found.some((f) => SERVER.test(f.file))
  for (const f of found) f.file = f.file.replace(SERVER, '').replace(/\?\d+$/, '')
  return { frames: found, server }
}
