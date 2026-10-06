'use client'

// Hold ⌥ to see what is under the pointer, ⌥-click to copy it, ⌥⇧-click to add more,
// ⌥↑ / ⌥↓ to step to the parent and back, Esc to clear. Styled inline and in raw values on
// purpose: this is a dev tool laid over the product, not part of it, and must not move
// when the tokens do.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { nearestName, snippet } from './inspect'

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])
const MARK = 'data-grab-me'
const PINK = '#ff2d87'
const never = () => () => {}
const isLocal = () => LOCAL.has(location.hostname)

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

export function GrabMeOverlay() {
  // Server and first paint say no; the client says yes on localhost only.
  const enabled = useSyncExternalStore(never, isLocal, () => false)
  const [hover, setHover] = useState<{ el: Element; box: Box; label: string } | null>(null)
  const [picked, setPicked] = useState<Element[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const state = useRef({
    active: false,
    x: 0,
    y: 0,
    target: null as Element | null,
    trail: [] as Element[],
    picked: [] as Element[],
  })

  useEffect(() => {
    if (!enabled) return
    const s = state.current
    let toastTimer: ReturnType<typeof setTimeout> | undefined
    let pickTimer: ReturnType<typeof setTimeout> | undefined

    const show = (el: Element | null) => {
      s.target = el
      if (!el) return setHover(null)
      const box = boxOf(el)
      const name = nearestName(el)
      setHover({
        el,
        box,
        label: `${name ? `${name} · ` : ''}${el.tagName.toLowerCase()} ${Math.round(box.width)}×${Math.round(box.height)}`,
      })
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
      setPicked([])
    }

    const say = (message: string) => {
      setToast(message)
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setToast(null), 1400)
    }

    const copy = async (els: Element[]) => {
      s.picked = els
      setPicked(els)
      // The dashed frames say what was copied, then get out of the way; ⌥⇧ within 3s adds on.
      // Armed before the clipboard, so a refused write cannot leave them on screen.
      clearTimeout(pickTimer)
      pickTimer = setTimeout(unpick, 3000)
      const text = snippet(els)
      try {
        // A promised blob keeps the click's user activation while source maps resolve.
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })),
          }),
        ])
      } catch {
        try {
          await navigator.clipboard.writeText(await text)
        } catch {
          console.info(await text)
          return say('Copy refused · snippet in console')
        }
      }
      console.info(await text)
      say(els.length > 1 ? `Copied ${els.length} elements` : 'Copied')
    }

    const onMove = (e: PointerEvent) => {
      s.x = e.clientX
      s.y = e.clientY
      if (!e.altKey) return s.active && deactivate()
      if (!s.active) return activate()
      const el = under(e.clientX, e.clientY)
      // A parent reached with ⌥↑ holds while the pointer stays inside it.
      if (el === s.target || (el && s.trail.length && s.target?.contains(el))) return
      s.trail = []
      show(el)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') return activate()
      if (e.key === 'Escape' && s.picked.length) return unpick()
      if (!s.active || !s.target) return
      if (e.key === 'ArrowUp') {
        const parent = s.target.parentElement
        if (parent && parent !== document.body && parent !== document.documentElement) {
          s.trail.push(s.target)
          show(parent)
        }
      } else if (e.key === 'ArrowDown') {
        const child = s.trail.pop()
        if (child) show(child)
      } else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') deactivate()
    }

    // The app opens menus and drawers on pointerdown; an ⌥-press is ours alone.
    const swallow = (e: MouseEvent) => {
      // A plain press anywhere is back to work: the frames go at once.
      if (!e.altKey && e.type === 'pointerdown' && s.picked.length) unpick()
      if (!e.altKey || e.button !== 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    const onClick = (e: MouseEvent) => {
      if (!e.altKey || e.button !== 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const el = s.target ?? under(e.clientX, e.clientY)
      if (!el) return
      if (!e.shiftKey) return void copy([el])
      const has = s.picked.includes(el)
      void copy(has ? s.picked.filter((p) => p !== el) : [...s.picked, el])
    }

    const refresh = () => s.target && show(s.target)

    const opts = { capture: true }
    window.addEventListener('pointermove', onMove, opts)
    window.addEventListener('keydown', onKeyDown, opts)
    window.addEventListener('keyup', onKeyUp, opts)
    window.addEventListener('blur', deactivate)
    window.addEventListener('scroll', refresh, opts)
    window.addEventListener('resize', refresh)
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const)
      window.addEventListener(t, swallow, opts)
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
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const)
        window.removeEventListener(t, swallow, opts)
      window.removeEventListener('click', onClick, opts)
    }
  }, [enabled])

  if (!enabled) return null

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
      {hover && (
        <>
          <div style={frame(hover.box, false)} />
          <div
            style={{
              position: 'fixed',
              top: hover.box.top > 24 ? hover.box.top - 22 : hover.box.top + hover.box.height + 4,
              left: Math.max(4, hover.box.left),
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
      )}
      {toast && (
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
          grab-me · {toast}
        </div>
      )}
    </div>
  )
}
