import { expect, it } from 'vitest'
import { format, formatScreen } from './format.js'
import type { NativeElement } from './grab.js'

const head = { platform: 'ios', window: { w: 402, h: 874 }, theme: 'light', warnings: [] }

const chip: NativeElement = {
  tag: 'Text',
  attrs: { testID: 'status' },
  text: 'Open',
  jsx: { file: 'src/ui/status-chip.tsx', line: 29 },
  owners: [{ name: 'StatusChip', at: 'src/ui/visit-card.tsx:96' }],
  styles: {
    box: { w: 33, h: 18 },
    font: {
      size: { value: '14', token: 'label' },
      lineHeight: '18',
      family: 'Inter_500Medium',
    },
    color: { value: '#000000', token: 'text.primary' },
  },
}

it('formats an element like the web snippet, with React Native styles', () => {
  expect(format({ ...head, route: '/', elements: [chip] })).toBe(
    [
      '<grab-me platform="ios" route="/" window="402×874" theme="light">',
      '<Text testID="status"> "Open"',
      '  jsx: src/ui/status-chip.tsx:29',
      '  rendered by:',
      '    <StatusChip> at src/ui/visit-card.tsx:96',
      '  box 33×18 · font label (14)/18 Inter_500Medium · color text.primary (#000000)',
      '</grab-me>',
    ].join('\n'),
  )
})

it('numbers several elements and prints every style part and the warnings', () => {
  const row: NativeElement = {
    tag: 'View',
    attrs: {},
    text: '',
    jsx: { file: 'src/a.tsx', line: null },
    owners: [],
    styles: {
      box: { w: 368, h: 62 },
      bg: { value: '#ffffff', token: 'surface.card' },
      padding: [{ value: '12', token: 'md' }, { value: '14' }, { value: '12' }, { value: '14' }],
      layout: { direction: 'row', align: 'center', justify: 'space-between', gap: { value: '8' } },
      border: { width: '1', color: { value: '#e0e2e5' } },
      radius: { value: '16', token: 'lg' },
      opacity: '0.5',
    },
  }
  const text = format({
    ...head,
    elements: [chip, { ...row, styles: { box: row.styles.box, border: { width: '1' } } }, row],
    warnings: ['source frames: /symbolicate answered 500'],
  })
  expect(text).toContain('[1] <Text testID="status"> "Open"')
  expect(text).toContain('[3] <View>\n  jsx: src/a.tsx\n')
  expect(text).toContain('  box 368×62 · border 1\n')
  expect(text).toContain(
    'box 368×62 · bg surface.card (#ffffff) · padding md (12) 14 12 14 · row align center justify space-between · gap 8 · border 1 #e0e2e5 · radius lg (16) · opacity 0.5',
  )
  expect(text).toContain('warnings:\n  source frames: /symbolicate answered 500\n</grab-me>')
})

it('lists the screen top to bottom, controls in brackets, each with where it is written', () => {
  const text = formatScreen({
    ...head,
    items: [
      {
        kind: 'control',
        text: 'Nieuwe log',
        box: { x: 0, y: 784.4, w: 1, h: 1 },
        owner: 'AppNav',
        jsx: { file: 'src/nav.tsx', line: 128 },
      },
      { kind: 'text', text: 'Vandaag', box: { x: 0, y: 123, w: 1, h: 1 } },
    ],
  })
  expect(text).toBe(
    [
      '<grab-me-screen platform="ios" window="402×874" theme="light">',
      '  y784 [Nieuwe log] — <AppNav> src/nav.tsx:128',
      '  y123 "Vandaag"',
      '</grab-me-screen>',
    ].join('\n'),
  )
})
