import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { GrabMeOverlay } from './overlay.js'

function need<T>(x: T | null | undefined): T {
  if (x == null) throw new Error('expected the value to exist')
  return x
}
function point(el: Element) {
  const r = el.getBoundingClientRect()
  return { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
}
function press(el: Element, mods: { shiftKey?: boolean; altKey?: boolean } = { altKey: true }) {
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, ...point(el), ...mods }
  el.dispatchEvent(new PointerEvent('pointermove', init))
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'])
    el.dispatchEvent(new PointerEvent(t, init))
  el.dispatchEvent(new MouseEvent('click', init))
}
const key = (k: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true }))

function App({ onClick }: { onClick: () => void }) {
  return (
    <div data-testid="parent" style={{ padding: 20 }}>
      <button data-testid="a" onClick={onClick}>
        A
      </button>
      <button data-testid="b" onClick={onClick}>
        B
      </button>
    </div>
  )
}

afterEach(() => vi.restoreAllMocks())

it('⌥-click hands the element to onGrab and the app never sees the click', async () => {
  const onGrab = vi.fn()
  const onClick = vi.fn()
  const s = await render(
    <>
      <App onClick={onClick} />
      <GrabMeOverlay onGrab={onGrab} />
    </>,
  )
  press(s.getByTestId('a').element())
  await expect.poll(() => onGrab.mock.calls.length).toBe(1)
  const [result, text] = need(onGrab.mock.calls[0])
  expect(
    result.elements.map((e: { attrs: Record<string, string> }) => e.attrs['data-testid']),
  ).toEqual(['a'])
  expect(text).toMatch(/^<grab-me url=/)
  expect(onClick).not.toHaveBeenCalled()
})

it('⌥⇧-click adds to the set and a second ⌥⇧-click on the same element takes it out', async () => {
  const onGrab = vi.fn()
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay onGrab={onGrab} />
    </>,
  )
  const ids = () =>
    onGrab.mock.lastCall?.[0].elements.map(
      (e: { attrs: Record<string, string> }) => e.attrs['data-testid'],
    )
  press(s.getByTestId('a').element(), { altKey: true, shiftKey: true })
  press(s.getByTestId('b').element(), { altKey: true, shiftKey: true })
  await expect.poll(ids).toEqual(['a', 'b'])
  press(s.getByTestId('a').element(), { altKey: true, shiftKey: true })
  await expect.poll(ids).toEqual(['b'])
})

it('⌥↑ climbs to the parent before the click', async () => {
  const onGrab = vi.fn()
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay onGrab={onGrab} />
    </>,
  )
  const a = s.getByTestId('a').element()
  a.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, ...point(a) }))
  key('ArrowUp')
  a.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      altKey: true,
      button: 0,
      ...point(a),
    }),
  )
  await expect.poll(() => onGrab.mock.lastCall?.[0].elements[0].attrs['data-testid']).toBe('parent')
})

it('a plain click is the app’s', async () => {
  const onGrab = vi.fn()
  const onClick = vi.fn()
  const s = await render(
    <>
      <App onClick={onClick} />
      <GrabMeOverlay onGrab={onGrab} />
    </>,
  )
  press(s.getByTestId('a').element(), {})
  expect(onClick).toHaveBeenCalledOnce()
  expect(onGrab).not.toHaveBeenCalled()
})

it('stays off on a host it was not given', async () => {
  const onGrab = vi.fn()
  const onClick = vi.fn()
  const s = await render(
    <>
      <App onClick={onClick} />
      <GrabMeOverlay hosts={['example.com']} onGrab={onGrab} />
    </>,
  )
  press(s.getByTestId('a').element())
  expect(onClick).toHaveBeenCalledOnce()
  expect(onGrab).not.toHaveBeenCalled()
})

it('grabs the host of a shadow root, the element the page can name', async () => {
  const onGrab = vi.fn()
  await render(<GrabMeOverlay onGrab={onGrab} />)
  const host = document.createElement('div')
  host.id = 'host'
  host.attachShadow({ mode: 'open' }).innerHTML =
    '<button style="width:80px;height:30px">in</button>'
  document.body.appendChild(host)
  press(need(need(host.shadowRoot).querySelector('button')))
  await expect.poll(() => onGrab.mock.lastCall?.[0].elements[0].attrs.id).toBe('host')
  host.remove()
})

it('when the clipboard is refused, the snippet goes to the console and the toast says so', async () => {
  vi.spyOn(navigator.clipboard, 'write').mockRejectedValue(
    new DOMException('denied', 'NotAllowedError'),
  )
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new DOMException('denied', 'NotAllowedError'),
  )
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay />
    </>,
  )
  press(s.getByTestId('a').element())
  await expect.poll(() => info.mock.calls.at(-1)?.[0]).toMatch(/^<grab-me /)
  await expect.element(s.getByText('grab-me · Copy refused · snippet in console')).toBeVisible()
})

it('with no navigator.clipboard at all (insecure origin), the snippet still reaches the console and the toast says so', async () => {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  try {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const s = await render(
      <>
        <App onClick={() => {}} />
        <GrabMeOverlay />
      </>,
    )
    press(s.getByTestId('a').element())
    await expect.poll(() => info.mock.calls.at(-1)?.[0]).toMatch(/^<grab-me /)
    await expect.element(s.getByText('grab-me · Copy refused · snippet in console')).toBeVisible()
  } finally {
    Reflect.deleteProperty(navigator, 'clipboard')
    if (original) Object.defineProperty(Navigator.prototype, 'clipboard', original)
  }
})

it('an onGrab that throws is reported to the console and the toast, not left uncaught', async () => {
  const boom = new Error('boom')
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay
        onGrab={() => {
          throw boom
        }}
      />
    </>,
  )
  press(s.getByTestId('a').element())
  await expect.poll(() => error.mock.calls.at(-1)?.[0]).toBe(boom)
  await expect.element(s.getByText('grab-me · grab failed · see console')).toBeVisible()
})

const dashed = () =>
  [...document.querySelectorAll<HTMLElement>('[data-grab-me] div')].filter((d) =>
    d.style.outline.includes('dashed'),
  ).length
const hoverMove = (el: Element) =>
  el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, ...point(el) }))

it('holding ⌥ outlines what is under the pointer and releasing it takes the outline away', async () => {
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay />
    </>,
  )
  hoverMove(s.getByTestId('a').element())
  hoverMove(s.getByTestId('a').element())
  await expect.element(s.getByText(/button \d+×\d+/)).toBeVisible()
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }))
  await expect.element(s.getByText(/button \d+×\d+/)).not.toBeInTheDocument()
})

it('⌥↓ steps back down to the child ⌥↑ came from', async () => {
  const onGrab = vi.fn()
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay onGrab={onGrab} />
    </>,
  )
  const a = s.getByTestId('a').element()
  hoverMove(a)
  hoverMove(a)
  key('ArrowUp')
  key('ArrowDown')
  a.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      altKey: true,
      button: 0,
      ...point(a),
    }),
  )
  await expect.poll(() => onGrab.mock.lastCall?.[0].elements[0].attrs['data-testid']).toBe('a')
})

it('Esc clears the dashed frames of a grab; so does a plain press', async () => {
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay onGrab={() => {}} />
    </>,
  )
  const b = s.getByTestId('b').element()
  press(s.getByTestId('a').element())
  hoverMove(b)
  await expect.poll(dashed).toBe(1)
  key('Escape')
  await expect.poll(dashed).toBe(0)
  press(s.getByTestId('a').element())
  hoverMove(b)
  await expect.poll(dashed).toBe(1)
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...point(b) }))
  await expect.poll(dashed).toBe(0)
})

it('losing window focus ends the outline', async () => {
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay />
    </>,
  )
  hoverMove(s.getByTestId('a').element())
  hoverMove(s.getByTestId('a').element())
  await expect.element(s.getByText(/button \d+×\d+/)).toBeVisible()
  window.dispatchEvent(new Event('blur'))
  await expect.element(s.getByText(/button \d+×\d+/)).not.toBeInTheDocument()
})

it('pressing ⌥ with the pointer already over something outlines it; arrows and other keys are left alone otherwise', async () => {
  const s = await render(
    <>
      <App onClick={() => {}} />
      <GrabMeOverlay />
    </>,
  )
  const a = s.getByTestId('a').element()
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
  window.dispatchEvent(arrow)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))
  expect(arrow.defaultPrevented).toBe(false)
  a.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...point(a) }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }))
  await expect.element(s.getByText(/button \d+×\d+/)).toBeVisible()
})
