'use client'

// Hold ⌥ to see what is under the pointer, ⌥-click to copy it, ⌥⇧-click to add more,
// ⌥↑ / ⌥↓ to step to the parent and back, Esc to clear. Styled inline and in raw values on
// purpose: this is a dev tool laid over the product, not part of it, and must not move
// when the product's tokens do.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { nearestName } from './core/fiber.js'
import { format } from './core/format.js'
import { grab, type GrabOptions, type GrabResult } from './core/grab.js'

type GrabMeOptions = Omit<GrabMeProps, 'hosts'>

export interface GrabMeProps extends GrabOptions {
  /** Hostnames the overlay switches on for; localhost only by default. */
  hosts?: string[]
  /** Replaces the default copy-to-clipboard with your own handling. */
  onGrab?: (result: GrabResult, text: string) => void | Promise<void>
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const MARK = 'data-grab-me'
const PINK = '#ff2d87'
const never = () => () => {}

interface Box {
  top: number
  left: number
  width: number
  height: number
}
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}
const labelOf = (el: Element, box: Box) => {
  const name = nearestName(el)
  return `${name ? `${name} · ` : ''}${el.tagName.toLowerCase()} ${Math.round(box.width)}×${Math.round(box.height)}`
}

async function toClipboard(text: Promise<string>): Promise<boolean> {
  try {
    // A promised blob keeps the click's user activation while source maps resolve.
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
    ])
    return true
  } catch {
    // Older engines refuse a promised blob; a plain write after the fact may still pass.
    // No navigator.clipboard at all on an insecure origin (http on a custom host).
    const plain = navigator.clipboard?.writeText(await text)
    return plain
      ? plain.then(
          () => true,
          () => false,
        )
      : false
  }
}

interface Hover {
  el: Element
  box: Box
  label: string
}
interface State {
  active: boolean
  x: number
  y: number
  target: Element | null
  trail: Element[]
  picked: Element[]
}
interface Ui {
  setHover: (hover: Hover | null) => void
  setPicked: (els: Element[]) => void
  setToast: (message: string | null) => void
}

const climbable = (p: Element | null | undefined): p is Element =>
  p != null && p !== document.body && p !== document.documentElement
const mine = (e: MouseEvent) => e.altKey && e.button === 0

const copiedMessage = (copied: boolean, count: number) =>
  copied ? (count > 1 ? `Copied ${count} elements` : 'Copied') : 'Copy refused · snippet in console'

async function run(els: Element[], latest: RefObject<GrabMeOptions>, say: (m: string) => void) {
  const { onGrab, ...opts } = latest.current
  const result = grab(els, opts)
  if (onGrab) {
    const r = await result
    return onGrab(r, format(r))
  }
  const text = result.then(format)
  const copied = await toClipboard(text)
  console.info(await text)
  say(copiedMessage(copied, els.length))
}

async function deliver(els: Element[], latest: RefObject<GrabMeOptions>, say: (m: string) => void) {
  try {
    await run(els, latest, say)
  } catch (err) {
    console.error(err)
    say('grab failed · see console')
  }
}

function listen(s: State, ui: Ui, latest: RefObject<GrabMeOptions>): () => void {
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let pickTimer: ReturnType<typeof setTimeout> | undefined

  const show = (el: Element | null) => {
    s.target = el
    if (!el) return ui.setHover(null)
    const box = boxOf(el)
    ui.setHover({ el, box, label: labelOf(el, box) })
  }
  const under = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    return el && !el.closest(`[${MARK}]`) ? el : null
  }
  const activate = () => {
    if (s.active) return
    s.active = true
    s.trail = []
    show(under(s.x, s.y))
  }
  const deactivate = () => {
    s.active = false
    s.trail = []
    show(null)
  }
  const unpick = () => {
    clearTimeout(pickTimer)
    s.picked = []
    ui.setPicked([])
  }
  const say = (message: string) => {
    ui.setToast(message)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => ui.setToast(null), 1400)
  }
  const select = (els: Element[]) => {
    s.picked = els
    ui.setPicked(els)
    // The dashed frames say what was grabbed, then get out of the way; ⌥⇧ within 3s adds on.
    clearTimeout(pickTimer)
    pickTimer = setTimeout(unpick, 3000)
    void deliver(els, latest, say)
  }

  // A parent reached with ⌥↑ holds while the pointer stays inside it.
  const holds = (el: Element | null) =>
    el === s.target || (el !== null && s.trail.length > 0 && !!s.target?.contains(el))
  const onMove = (e: PointerEvent) => {
    s.x = e.clientX
    s.y = e.clientY
    if (!e.altKey) return s.active && deactivate()
    if (!s.active) return activate()
    const el = under(e.clientX, e.clientY)
    if (holds(el)) return
    s.trail = []
    show(el)
  }

  const up = () => {
    const from = s.target
    const parent = from?.parentElement
    if (!from || !climbable(parent)) return
    s.trail.push(from)
    show(parent)
  }
  const down = () => {
    const child = s.trail.pop()
    if (child) show(child)
  }
  const STEPS = new Map([
    ['ArrowUp', up],
    ['ArrowDown', down],
  ])
  const grabbing = () => s.active && s.target !== null

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') return activate()
    if (e.key === 'Escape' && s.picked.length) return unpick()
    const step = STEPS.get(e.key)
    if (!step || !grabbing()) return
    step()
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') deactivate()
  }

  // Apps open menus and drawers on pointerdown; an ⌥-press is ours alone.
  const swallow = (e: MouseEvent) => {
    // A plain press anywhere is back to work: the frames go at once.
    if (!e.altKey && e.type === 'pointerdown' && s.picked.length) unpick()
    if (!mine(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  const toggle = (el: Element) =>
    s.picked.includes(el) ? s.picked.filter((p) => p !== el) : [...s.picked, el]
  const onClick = (e: MouseEvent) => {
    if (!mine(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const el = s.target ?? under(e.clientX, e.clientY)
    if (el) select(e.shiftKey ? toggle(el) : [el])
  }

  const refresh = () => s.target && show(s.target)
  const PRESSES = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const
  const opts = { capture: true }
  window.addEventListener('pointermove', onMove, opts)
  window.addEventListener('keydown', onKeyDown, opts)
  window.addEventListener('keyup', onKeyUp, opts)
  window.addEventListener('blur', deactivate)
  window.addEventListener('scroll', refresh, opts)
  window.addEventListener('resize', refresh)
  for (const t of PRESSES) window.addEventListener(t, swallow, opts)
  window.addEventListener('click', onClick, opts)
  return () => {
    clearTimeout(toastTimer)
    clearTimeout(pickTimer)
    window.removeEventListener('pointermove', onMove, opts)
    window.removeEventListener('keydown', onKeyDown, opts)
    window.removeEventListener('keyup', onKeyUp, opts)
    window.removeEventListener('blur', deactivate)
    window.removeEventListener('scroll', refresh, opts)
    window.removeEventListener('resize', refresh)
    for (const t of PRESSES) window.removeEventListener(t, swallow, opts)
    window.removeEventListener('click', onClick, opts)
  }
}

const frame = (b: Box, dashed: boolean) =>
  ({
    position: 'fixed',
    top: b.top,
    left: b.left,
    width: b.width,
    height: b.height,
    outline: `2px ${dashed ? 'dashed' : 'solid'} ${PINK}`,
    outlineOffset: -1,
    background: dashed ? 'transparent' : 'rgba(255, 45, 135, 0.08)',
    pointerEvents: 'none',
  }) as const

function Hovered({ hover }: { hover: Hover }) {
  const { box } = hover
  return (
    <>
      <div style={frame(box, false)} />
      <div
        style={{
          position: 'fixed',
          top: box.top > 24 ? box.top - 22 : box.top + box.height + 4,
          left: Math.max(4, box.left),
          padding: '2px 6px',
          borderRadius: 4,
          background: PINK,
          color: '#fff',
          font: '500 11px/16px ui-monospace, monospace',
          whiteSpace: 'nowrap',
        }}
      >
        {hover.label}
      </div>
    </>
  )
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        borderRadius: 6,
        background: '#111',
        color: '#fff',
        font: '500 12px/16px ui-monospace, monospace',
      }}
    >
      grab-me · {message}
    </div>
  )
}

export function GrabMeOverlay({ hosts = LOCAL_HOSTS, ...options }: GrabMeProps) {
  // Server and first paint say no; the client says yes on the given hosts only.
  const enabled = useSyncExternalStore(
    never,
    () => hosts.includes(location.hostname),
    () => false,
  )
  const [hover, setHover] = useState<Hover | null>(null)
  const [picked, setPicked] = useState<Element[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const state = useRef<State>({ active: false, x: 0, y: 0, target: null, trail: [], picked: [] })

  useEffect(
    () => (enabled ? listen(state.current, { setHover, setPicked, setToast }, latest) : undefined),
    [enabled],
  )

  if (!enabled) return null
  return (
    <div
      {...{ [MARK]: '' }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483647 }}
    >
      {picked
        .filter((el) => el.isConnected && el !== hover?.el)
        .map((el, i) => (
          <div key={i} style={frame(boxOf(el), true)} />
        ))}
      {hover && <Hovered hover={hover} />}
      {toast && <Toast message={toast} />}
    </div>
  )
}
