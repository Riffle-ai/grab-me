import { afterEach, describe as group, expect, it } from 'vitest'
import { describe, styles } from './describe.js'
import { token } from './tokens.js'

const css = (text: string) => {
  const s = document.createElement('style')
  s.textContent = text
  document.head.appendChild(s)
  return s
}
const el = (html: string) => {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host.firstElementChild as HTMLElement
}

afterEach(() => {
  document.head.querySelectorAll('style').forEach((s) => s.remove())
  document.body.innerHTML = ''
  delete document.documentElement.dataset.theme
})

group('token', () => {
  it('names the :root custom property a computed value came from', () => {
    css(':root { --text-sm: 14px; --color-ink: rgb(17, 17, 17); --radius-md: 6px }')
    expect(token('text', '14px')).toEqual({ value: '14px', token: '--text-sm' })
    expect(token('color', 'rgb(17, 17, 17)')).toEqual({
      value: 'rgb(17, 17, 17)',
      token: '--color-ink',
    })
    expect(token('radius', '7px')).toEqual({ value: '7px' })
  })

  it('rebuilds the map when the theme changes, since the same token resolves differently', () => {
    css(
      ':root { --color-ink: rgb(17, 17, 17) } :root[data-theme="dark"] { --color-ink: rgb(250, 250, 250) }',
    )
    expect(token('color', 'rgb(17, 17, 17)').token).toBe('--color-ink')
    document.documentElement.dataset.theme = 'dark'
    expect(token('color', 'rgb(250, 250, 250)').token).toBe('--color-ink')
  })

  it('skips a stylesheet whose rules the browser will not show (cross-origin) and keeps mapping', () => {
    css(':root { --text-sm: 14px }')
    const sheet = css('.x {}').sheet as CSSStyleSheet
    Object.defineProperty(sheet, 'cssRules', {
      get: () => {
        throw new DOMException('cross-origin', 'SecurityError')
      },
    })
    document.documentElement.dataset.theme = 'x' // force a rebuild past any cache
    expect(token('text', '14px').token).toBe('--text-sm')
  })
})

group('describe', () => {
  it('keeps the identifying attributes in order and clips class and text', () => {
    const long = 'a'.repeat(250)
    const d = describe(
      el(
        `<button data-testid="go" role="tab" class="${long}" aria-label="Go">  Save   ${'b'.repeat(120)} </button>`,
      ),
    )
    expect(d.tag).toBe('button')
    expect(Object.keys(d.attrs)).toEqual(['data-testid', 'role', 'aria-label', 'class'])
    expect(d.attrs.class).toBe(`${'a'.repeat(200)}…`)
    expect(d.text).toBe(`Save ${'b'.repeat(95)}…`)
  })
})

group('styles', () => {
  it('reports box, font, colours, padding, layout, borders and radius, each with its token', () => {
    css(':root { --text-sm: 14px; --color-ink: rgb(17, 17, 17); --spacing: 4px; --radius-md: 6px }')
    const s = styles(
      el(
        '<div style="width:100px;height:20px;font-size:14px;line-height:20px;font-weight:500;color:rgb(17,17,17);padding:4px 0 4px 0;display:flex;gap:4px;border-top:1px solid rgb(17,17,17);border-radius:6px"></div>',
      ),
    )
    // content-box: 20 content + 4 + 4 padding + 1 border-top (the brief's 28 omitted the border)
    expect(s.box).toEqual({ w: 100, h: 29 })
    expect(s.font).toEqual({
      size: { value: '14px', token: '--text-sm' },
      lineHeight: '20px',
      weight: '500',
    })
    expect(s.padding?.map((p) => p.token ?? p.value)).toEqual([
      '--spacing',
      '0px',
      '--spacing',
      '0px',
    ])
    expect(s.layout).toEqual({
      display: 'flex',
      direction: 'row',
      gap: { value: '4px', token: '--spacing' },
    })
    expect(s.borders).toEqual([
      { side: 'top', width: '1px', color: { value: 'rgb(17, 17, 17)', token: '--color-ink' } },
    ])
    expect(s.radius).toEqual({ value: '6px', token: '--radius-md' })
    expect(s.bg).toBeUndefined()
  })
})
