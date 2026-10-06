// Reads what React and the browser know about a DOM node and writes it as a snippet an
// agent can act on: where the JSX lives, which components own it, which tokens it wears.
// Leans on React 19 dev internals (_debugOwner, _debugStack) and Next's dev-only
// /__nextjs_original-stack-frames endpoint; when either moves, the snippet degrades to
// names and classes rather than failing.

/** A client component's fiber, or the info React keeps for a server component. */
type Owner = Fiber | ServerInfo
interface Fiber {
  tag: number
  type: unknown
  _debugOwner?: Owner | null
  _debugStack?: Error | null
}
interface ServerInfo {
  name: string
  env?: string
  owner?: Owner | null
  debugStack?: Error | null
}
interface Frame {
  file: string
  methodName: string
  arguments: string[]
  line1: number | null
  column1: number | null
}

// Walk far enough to pass Next's own router components; show only the project's.
const MAX_OWNERS = 40
const SHOW_OWNERS = 6
const MAX_SHOWN = 10

const isFiber = (o: Owner): o is Fiber => 'tag' in o

function fiberOf(el: Element): Fiber | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  return key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null
}

function typeName(type: unknown): string | null {
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

const ownerName = (o: Owner) => (isFiber(o) ? typeName(o.type) : o.name) ?? 'Anonymous'
const ownerParent = (o: Owner) => (isFiber(o) ? o._debugOwner : o.owner) ?? null

/** The components that rendered `el`, nearest first. */
function owners(el: Element): Owner[] {
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

/** The frames of a JSX call site, below React's own jsx frame. */
function callSite(stack: Error | null): { frames: Frame[]; server: boolean } | null {
  // Past React's per-second budget a node gets a shared placeholder stack, not its own.
  if (!stack?.stack || stack.stack.includes('UnknownOwner')) return null
  const lines = stack.stack.split('\n')
  const frames: Frame[] = []
  for (const line of lines) {
    const m = FRAME.exec(line)
    if (!m) continue
    const [, method = '', file = '', l, c] = m
    if (/jsx|react-stack-top-frame/i.test(method) && frames.length === 0) continue
    frames.push({
      file,
      methodName: method,
      arguments: [],
      line1: Number(l),
      column1: Number(c),
    })
    if (frames.length === 3) break
  }
  if (!frames.length) return null
  const server = frames.some((f) => f.file.startsWith('about://React/Server/'))
  for (const f of frames)
    f.file = f.file.replace(/^about:\/\/React\/Server\//, '').replace(/\?\d+$/, '')
  return { frames, server }
}

interface Resolved {
  file: string
  line: number | null
}

/** Maps bundled frames back to source through Next's dev server. */
async function resolve(frames: Frame[], server: boolean): Promise<Resolved | null> {
  try {
    const res = await fetch('/__nextjs_original-stack-frames', {
      method: 'POST',
      body: JSON.stringify({ frames, isServer: server, isEdgeServer: false, isAppDirectory: true }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{
      status: string
      value?: { originalStackFrame?: { file?: string; line1?: number; ignored?: boolean } | null }
    }>
    for (const r of data) {
      const f = r.value?.originalStackFrame
      if (r.status !== 'fulfilled' || !f?.file || f.ignored) continue
      const file = projectPath(f.file)
      if (file.includes('node_modules') || file.startsWith('<')) continue
      return { file, line: f.line1 ?? null }
    }
  } catch {
    // The endpoint is Next internals; without it the snippet keeps names only.
  }
  return null
}

function projectPath(file: string) {
  return decodeURIComponent(file)
    .replace(/^file:\/\//, '')
    .replace(/^\[project\]\//, '')
    .replace(/^.*?\/dashboard\//, '')
}

// ── tokens ───────────────────────────────────────────────────────────────────────────

type Kind = 'color' | 'space' | 'radius' | 'text'
let tokens: Map<string, string> | null = null

function customProperties(): string[] {
  const names = new Set<string>()
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && /:root/.test(rule.selectorText)) {
        for (const p of Array.from(rule.style)) if (p.startsWith('--')) names.add(p)
      }
      if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      // cross-origin sheet
    }
  }
  return [...names]
}

const kindOf = (name: string): Kind | null =>
  name.startsWith('--color-')
    ? 'color'
    : name.startsWith('--spacing')
      ? 'space'
      : name.startsWith('--radius')
        ? 'radius'
        : /^--text-[a-z-]+$/.test(name) && !name.includes('--', 2)
          ? 'text'
          : null

/** computed value → token name, per kind, for the theme on screen now. */
function tokenMap(): Map<string, string> {
  if (tokens && tokens.get('theme') === theme()) return tokens
  const map = new Map<string, string>([['theme', theme()]])
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  document.body.appendChild(probe)
  for (const name of customProperties()) {
    const kind = kindOf(name)
    if (!kind) continue
    probe.style.cssText = 'position:absolute;visibility:hidden'
    const prop = kind === 'color' ? 'color' : 'width'
    probe.style.setProperty(prop, `var(${name})`)
    const value = getComputedStyle(probe).getPropertyValue(prop)
    if (!value || value === '0px' || value === 'auto') continue
    const key = `${kind}:${value}`
    if (!map.has(key)) map.set(key, name)
  }
  probe.remove()
  tokens = map
  return map
}

function token(kind: Kind, value: string) {
  const name = tokenMap().get(`${kind}:${value}`)
  return name ? `${name} (${value})` : value
}

const theme = () => document.documentElement.dataset.theme ?? 'light'

function styles(el: Element): string {
  const s = getComputedStyle(el)
  const parts: string[] = []
  const r = el.getBoundingClientRect()
  parts.push(`box ${Math.round(r.width)}×${Math.round(r.height)}`)
  parts.push(`font ${token('text', s.fontSize)}/${s.lineHeight} ${s.fontWeight}`)
  parts.push(`color ${token('color', s.color)}`)
  if (s.backgroundColor !== 'rgba(0, 0, 0, 0)')
    parts.push(`bg ${token('color', s.backgroundColor)}`)
  const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]
  if (pad.some((p) => p !== '0px'))
    parts.push(`padding ${pad.map((p) => token('space', p)).join(' ')}`)
  if (s.display.includes('flex') || s.display.includes('grid')) {
    parts.push(`${s.display} ${s.flexDirection}`)
    if (s.gap !== 'normal' && s.gap !== '0px') parts.push(`gap ${token('space', s.rowGap)}`)
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = s.getPropertyValue(`border-${side.toLowerCase()}-width`)
    if (width === '0px' || s.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none')
      continue
    const color = s.getPropertyValue(`border-${side.toLowerCase()}-color`)
    parts.push(`border-${side.toLowerCase()} ${width} ${token('color', color)}`)
  }
  if (s.borderTopLeftRadius !== '0px')
    parts.push(`radius ${token('radius', s.borderTopLeftRadius)}`)
  return parts.join(' · ')
}

// ── snippet ──────────────────────────────────────────────────────────────────────────

const ATTRS = ['id', 'data-testid', 'role', 'aria-label', 'name', 'href', 'data-slot']

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const attrs = ATTRS.map((a) => [a, el.getAttribute(a)] as const)
    .filter(([, v]) => v)
    .map(([a, v]) => `${a}="${v}"`)
  const cls = el.getAttribute('class')
  if (cls) attrs.push(`class="${cls.length > 200 ? `${cls.slice(0, 200)}…` : cls}"`)
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const quoted = text ? ` "${text.length > 100 ? `${text.slice(0, 100)}…` : text}"` : ''
  return `<${[tag, ...attrs].join(' ')}>${quoted}`
}

interface Definition {
  file: string
  line: number
}

/** name → where it is defined, from the dev-only lookup route. */
async function definitions(names: string[]): Promise<Record<string, Definition[]>> {
  try {
    const res = await fetch(
      `/api/dev/grab-me?names=${encodeURIComponent([...new Set(names)].join(','))}`,
    )
    return res.ok ? ((await res.json()) as Record<string, Definition[]>) : {}
  } catch {
    return {}
  }
}

async function entry(el: Element, n: number, total: number): Promise<string> {
  const chain = owners(el)
  const [defs, site] = await Promise.all([
    definitions(chain.map(ownerName)),
    // A node's own _debugStack is its JSX call site: the exact line, when React kept it.
    (async () => {
      const cs = callSite(fiberOf(el)?._debugStack ?? null)
      return cs ? resolve(cs.frames, cs.server) : null
    })(),
  ])
  const where = (d: Definition[] | undefined) =>
    !d?.length
      ? null
      : d.length === 1
        ? `${d[0]?.file}:${d[0]?.line}`
        : d.map((x) => `${x.file}:${x.line}`).join(' | ')
  const ours: Array<{ name: string; server: boolean; at: string }> = []
  for (const o of chain) {
    const name = ownerName(o)
    const at = where(defs[name])
    // Recursive components (rows in rows) appear once; Next's router has no definition here.
    if (!at || ours.at(-1)?.name === name) continue
    ours.push({ name, server: !isFiber(o), at })
    // Through the ui/ components to the screens that use them, then stop.
    if (ours.filter((x) => !x.at.startsWith('ui/')).length === 2 || ours.length === MAX_SHOWN) break
  }

  const lines = [`${total > 1 ? `[${n}] ` : ''}${describe(el)}`]
  if (site) lines.push(`  jsx: ${site.file}${site.line ? `:${site.line}` : ''}`)
  if (ours.length)
    lines.push(
      '  rendered by:',
      ...ours.map((o) => `    ${o.name}${o.server ? ' (server)' : ''} — ${o.at}`),
    )
  else if (chain.length)
    lines.push(`  rendered by: ${chain.slice(0, SHOW_OWNERS).map(ownerName).join(' ‹ ')}`)
  lines.push(`  ${styles(el)}`)
  return lines.join('\n')
}

export async function snippet(els: Element[]): Promise<string> {
  const head = `<grab-me url="${location.pathname}${location.search}" viewport="${innerWidth}×${innerHeight}" theme="${theme()}">`
  const body = await Promise.all(els.map((el, i) => entry(el, i + 1, els.length)))
  return [head, ...body, '</grab-me>'].join('\n')
}
