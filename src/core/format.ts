// The <grab-me> text an agent reads. Byte-identical to the dashboard's original snippet
// whenever there are no warnings (asserted against test/legacy/inspect.ts).
import type { Styled } from './tokens.js'
import type { Styles } from './describe.js'
import type { GrabbedElement, GrabResult } from './grab.js'

const fmt = (s: Styled) => (s.token ? `${s.token} (${s.value})` : s.value)

const PARTS: Array<(s: Styles) => string | undefined> = [
  (s) => `box ${s.box.w}×${s.box.h}`,
  (s) => `font ${fmt(s.font.size)}/${s.font.lineHeight} ${s.font.weight}`,
  (s) => `color ${fmt(s.color)}`,
  (s) => s.bg && `bg ${fmt(s.bg)}`,
  (s) => s.padding && `padding ${s.padding.map(fmt).join(' ')}`,
  (s) => s.layout && `${s.layout.display} ${s.layout.direction}`,
  (s) => s.layout?.gap && `gap ${fmt(s.layout.gap)}`,
  (s) =>
    s.borders.map((b) => `border-${b.side} ${b.width} ${fmt(b.color)}`).join(' · ') || undefined,
  (s) => s.radius && `radius ${fmt(s.radius)}`,
]

const styleLine = (s: Styles) =>
  PARTS.map((p) => p(s))
    .filter(Boolean)
    .join(' · ')

function tagLine(e: GrabbedElement, n: number, total: number) {
  const attrs = Object.entries(e.attrs).map(([a, v]) => `${a}="${v}"`)
  const quoted = e.text ? ` "${e.text}"` : ''
  return `${total > 1 ? `[${n}] ` : ''}<${[e.tag, ...attrs].join(' ')}>${quoted}`
}

function ownerLines(e: GrabbedElement): string[] {
  if (!e.owners.length) return []
  if (e.owners[0]?.at === undefined)
    return [`  rendered by: ${e.owners.map((o) => o.name).join(' ‹ ')}`]
  return [
    '  rendered by:',
    ...e.owners.map((o) => `    ${o.name}${o.server ? ' (server)' : ''} — ${o.at}`),
  ]
}

function entry(e: GrabbedElement, n: number, total: number): string {
  const jsx = e.jsx ? [`  jsx: ${e.jsx.file}${e.jsx.line ? `:${e.jsx.line}` : ''}`] : []
  return [tagLine(e, n, total), ...jsx, ...ownerLines(e), `  ${styleLine(e.styles)}`].join('\n')
}

export function format(r: GrabResult): string {
  const head = `<grab-me url="${r.url}" viewport="${r.viewport.w}×${r.viewport.h}" theme="${r.theme}">`
  const body = r.elements.map((e, i) => entry(e, i + 1, r.elements.length))
  const tail = r.warnings.length ? ['warnings:', ...r.warnings.map((w) => `  ${w}`)] : []
  return [head, ...body, ...tail, '</grab-me>'].join('\n')
}
