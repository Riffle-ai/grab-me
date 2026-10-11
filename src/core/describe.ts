// What an element is (tag, identifying attributes, text) and what it wears (computed styles,
// each value named by its token when one matches).
import { token, type Styled } from './tokens.js'

const ATTRS = ['id', 'data-testid', 'role', 'aria-label', 'name', 'href', 'data-slot']
const SIDES = ['top', 'right', 'bottom', 'left'] as const
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export type Side = (typeof SIDES)[number]
export interface Described {
  tag: string
  attrs: Record<string, string>
  text: string
}
export interface Styles {
  box: { w: number; h: number }
  font: { size: Styled; lineHeight: string; weight: string }
  color: Styled
  bg?: Styled
  padding?: [Styled, Styled, Styled, Styled]
  layout?: { display: string; direction: string; gap?: Styled }
  borders: Array<{ side: Side; width: string; color: Styled }>
  radius?: Styled
}

export function describe(el: Element): Described {
  const attrs: Record<string, string> = {}
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v) attrs[a] = v
  }
  const cls = el.getAttribute('class')
  if (cls) attrs.class = clip(cls, 200)
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { tag: el.tagName.toLowerCase(), attrs, text: clip(text, 100) }
}

function padding(s: CSSStyleDeclaration): Styles['padding'] {
  const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]
  if (pad.every((p) => p === '0px')) return undefined
  return pad.map((p) => token('space', p)) as Styles['padding']
}

function layout(s: CSSStyleDeclaration): Styles['layout'] {
  if (!s.display.includes('flex') && !s.display.includes('grid')) return undefined
  const gapped = s.gap !== 'normal' && s.gap !== '0px'
  return {
    display: s.display,
    direction: s.flexDirection,
    ...(gapped ? { gap: token('space', s.rowGap) } : {}),
  }
}

function borders(s: CSSStyleDeclaration): Styles['borders'] {
  return SIDES.filter(
    (side) =>
      s.getPropertyValue(`border-${side}-width`) !== '0px' &&
      s.getPropertyValue(`border-${side}-style`) !== 'none',
  ).map((side) => ({
    side,
    width: s.getPropertyValue(`border-${side}-width`),
    color: token('color', s.getPropertyValue(`border-${side}-color`)),
  }))
}

const optional = <K extends string>(key: K, value: Styled | undefined) =>
  (value ? { [key]: value } : {}) as Partial<Record<K, Styled>>

export function styles(el: Element): Styles {
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const pad = padding(s)
  const lay = layout(s)
  return {
    box: { w: Math.round(r.width), h: Math.round(r.height) },
    font: { size: token('text', s.fontSize), lineHeight: s.lineHeight, weight: s.fontWeight },
    color: token('color', s.color),
    ...optional(
      'bg',
      s.backgroundColor === 'rgba(0, 0, 0, 0)' ? undefined : token('color', s.backgroundColor),
    ),
    ...(pad ? { padding: pad } : {}),
    ...(lay ? { layout: lay } : {}),
    borders: borders(s),
    ...optional(
      'radius',
      s.borderTopLeftRadius === '0px' ? undefined : token('radius', s.borderTopLeftRadius),
    ),
  }
}
