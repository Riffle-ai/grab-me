// Maps a computed value back to the design token that produced it, by probing every custom
// property declared on :root. Built once per theme; a theme switch rebuilds it.
export type Kind = 'color' | 'space' | 'radius' | 'text'
export interface Styled {
  value: string
  token?: string
}

let cache: { theme: string; map: Map<string, string> } | null = null

export const theme = () => document.documentElement.dataset.theme ?? 'light'

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules
  } catch (e) {
    // A cross-origin sheet hides its rules; it declares no tokens we could read anyway.
    if (e instanceof DOMException && e.name === 'SecurityError') return null
    throw e
  }
}

function declared(rule: CSSRule, names: Set<string>) {
  if (!(rule instanceof CSSStyleRule) || !/:root/.test(rule.selectorText)) return
  for (const p of Array.from(rule.style)) if (p.startsWith('--')) names.add(p)
}

function collect(rules: CSSRuleList, names: Set<string>) {
  for (const rule of Array.from(rules)) {
    declared(rule, names)
    if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules, names)
  }
}

function customProperties(): string[] {
  const names = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    const rules = rulesOf(sheet)
    if (rules) collect(rules, names)
  }
  return [...names]
}

export function kindOf(name: string): Kind | null {
  if (name.startsWith('--color-')) return 'color'
  if (name.startsWith('--spacing')) return 'space'
  if (name.startsWith('--radius')) return 'radius'
  return /^--text-[a-z-]+$/.test(name) && !name.includes('--', 2) ? 'text' : null
}

function probe(el: HTMLElement, name: string, kind: Kind): string {
  const prop = kind === 'color' ? 'color' : 'width'
  el.style.cssText = 'position:absolute;visibility:hidden'
  el.style.setProperty(prop, `var(${name})`)
  return getComputedStyle(el).getPropertyValue(prop)
}

const USELESS = new Set(['', '0px', 'auto'])

function build(): Map<string, string> {
  const map = new Map<string, string>()
  const el = document.createElement('div')
  document.body.appendChild(el)
  for (const name of customProperties()) {
    const kind = kindOf(name)
    if (!kind) continue
    const value = probe(el, name, kind)
    if (!USELESS.has(value) && !map.has(`${kind}:${value}`)) map.set(`${kind}:${value}`, name)
  }
  el.remove()
  return map
}

export function token(kind: Kind, value: string): Styled {
  if (cache?.theme !== theme()) cache = { theme: theme(), map: build() }
  const name = cache.map.get(`${kind}:${value}`)
  return name ? { value, token: name } : { value }
}
