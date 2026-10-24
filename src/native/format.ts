// The <grab-me> text for a native grab: the web snippet's shape, with React Native's
// style props in place of computed CSS.
import type { Styled } from '../core/tokens.js'
import type { Site } from '../core/resolver.js'
import type { NativeElement, NativeGrabResult, ScreenResult } from './grab.js'
import type { NativeStyles } from './host.js'

const fmt = (s: Styled) => (s.token ? `${s.token} (${s.value})` : s.value)
const at = (s: Site) => `${s.file}${s.line ? `:${s.line}` : ''}`

const PARTS: Array<(s: NativeStyles) => string | undefined> = [
  (s) => `box ${s.box.w}×${s.box.h}`,
  (s) =>
    s.font &&
    [
      `font ${fmt(s.font.size)}${s.font.lineHeight ? `/${s.font.lineHeight}` : ''}`,
      s.font.family,
      s.font.weight,
    ]
      .filter(Boolean)
      .join(' '),
  (s) => s.color && `color ${fmt(s.color)}`,
  (s) => s.bg && `bg ${fmt(s.bg)}`,
  (s) => s.padding && `padding ${s.padding.map(fmt).join(' ')}`,
  (s) =>
    s.layout &&
    [
      s.layout.direction,
      s.layout.align && `align ${s.layout.align}`,
      s.layout.justify && `justify ${s.layout.justify}`,
    ]
      .filter(Boolean)
      .join(' '),
  (s) => s.layout?.gap && `gap ${fmt(s.layout.gap)}`,
  (s) => s.border && `border ${s.border.width}${s.border.color ? ` ${fmt(s.border.color)}` : ''}`,
  (s) => s.radius && `radius ${fmt(s.radius)}`,
  (s) => s.opacity && `opacity ${s.opacity}`,
]

const styleLine = (s: NativeStyles) =>
  PARTS.map((p) => p(s))
    .filter(Boolean)
    .join(' · ')

function tagLine(e: NativeElement, n: number, total: number) {
  const attrs = Object.entries(e.attrs).map(([a, v]) => `${a}="${v}"`)
  const quoted = e.text ? ` "${e.text}"` : ''
  return `${total > 1 ? `[${n}] ` : ''}<${[e.tag, ...attrs].join(' ')}>${quoted}`
}

function entry(e: NativeElement, n: number, total: number): string {
  return [
    tagLine(e, n, total),
    ...(e.jsx ? [`  jsx: ${at(e.jsx)}`] : []),
    ...(e.owners.length
      ? ['  rendered by:', ...e.owners.map((o) => `    <${o.name}> at ${o.at}`)]
      : []),
    `  ${styleLine(e.styles)}`,
  ].join('\n')
}

function open(tag: string, r: Omit<NativeGrabResult, 'elements'>) {
  const route = r.route ? ` route="${r.route}"` : ''
  return `<${tag} platform="${r.platform}"${route} window="${r.window.w}×${r.window.h}" theme="${r.theme}">`
}

const tail = (warnings: string[]) =>
  warnings.length ? ['warnings:', ...warnings.map((w) => `  ${w}`)] : []

export function format(r: NativeGrabResult): string {
  const body = r.elements.map((e, i) => entry(e, i + 1, r.elements.length))
  return [open('grab-me', r), ...body, ...tail(r.warnings), '</grab-me>'].join('\n')
}

export function formatScreen(r: ScreenResult): string {
  const lines = r.items.map((it) => {
    const where = [it.owner && `<${it.owner}>`, it.jsx && at(it.jsx)].filter(Boolean).join(' ')
    const what = it.kind === 'control' ? `[${it.text}]` : `"${it.text}"`
    return `  y${Math.round(it.box.y)} ${what}${where ? ` — ${where}` : ''}`
  })
  return [open('grab-me-screen', r), ...lines, ...tail(r.warnings), '</grab-me-screen>'].join('\n')
}
