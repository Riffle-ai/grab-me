# grab-me

Hold **⌥** and click anything in your React dev app. grab-me copies a reference your coding
agent can act on: where the JSX lives, which components own it (server components too), and
which **design tokens** it wears.

```
<grab-me url="/orders?tab=open" viewport="1512×982" theme="light">
<button data-testid="approve" class="…"> "Approve"
  jsx: features/orders/row.tsx:42
  rendered by:
    Button — ui/button.tsx:18
    OrderRow — features/orders/row.tsx:12
    OrdersPage (server) — app/orders/page.tsx:9
  box 88×32 · font --text-sm (14px)/20px 500 · color --color-ink (rgb(17, 17, 17)) · padding --spacing (4px) …
</grab-me>
```

Paste it into Claude Code, Cursor or any chat: the agent opens the right file at the right
line and speaks your design system's names, not raw pixels.

## Why grab-me

- **Tokens, not pixels.** Computed styles are mapped back to the CSS custom properties on
  `:root` that produced them, per theme.
- **Server components included.** The owner chain walks React 19's server owners, marked
  `(server)`.
- **Several at once.** ⌥⇧-click adds elements to one snippet; ⌥↑ / ⌥↓ step to the parent and back.
- **Nothing in production.** Next and Vite builds ship zero bytes of it, and a test proves it.
- **React Native too.** Tap to grab in the simulator or on a phone, and `grab-me screen` reads
  the whole screen as text for your agent, through Metro's own debugger connection.

## Requirements

React 19 in a development build. TypeScript projects need `moduleResolution` set to `bundler`
or `node16` / `nodenext`, because the package exposes subpath exports (`/next`, `/vite`,
`/native`). React Native needs a development build on the New Architecture; the `grab-me` CLI
needs Node 20.19 or later.

## Install

```sh
pnpm add -D @riffle-ai/grab-me
```

### Next.js 16 (App Router)

```tsx
// app/layout.tsx
import { GrabMe } from '@riffle-ai/grab-me/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <GrabMe />
      </body>
    </html>
  )
}
```

```ts
// app/api/dev/grab-me/route.ts
import { createGrabMeRoute } from '@riffle-ai/grab-me/next/route'
export const GET = createGrabMeRoute()
```

`createGrabMeRoute({ roots })` narrows where component definitions are searched.

`<GrabMe />` is the zero-config path. It takes `stopAfter`, `hosts` and `endpoint` (where the
route is mounted; default `/api/dev/grab-me`), but no `onGrab`: functions do not cross from a
server component. For your own handling, render `GrabMeOverlay` from a client component with
`nextResolver()` (keep the route above). Load that component only in development, and create
the resolver inside it, so a production build never reaches any of it:

```tsx
// app/dev-grab.tsx
'use client'
import { GrabMeOverlay } from '@riffle-ai/grab-me'
import { nextResolver } from '@riffle-ai/grab-me/next'
import { useMemo } from 'react'

export default function DevGrab() {
  const resolver = useMemo(() => nextResolver(), [])
  return <GrabMeOverlay resolver={resolver} onGrab={(result, text) => console.log(text)} />
}
```

```tsx
// app/dev-grab-loader.tsx
'use client'
import dynamic from 'next/dynamic'

// The import sits in a branch that exists only in development: no chunk in production.
const DevGrab = process.env.NODE_ENV === 'development' ? dynamic(() => import('./dev-grab')) : null

export function DevGrabLoader() {
  return DevGrab && <DevGrab />
}
```

Render `<DevGrabLoader />` once in your layout. `examples/next` runs exactly this on `/custom`,
and the production-safety test builds it.

Next support is tested under Turbopack, the default bundler of Next 16.

### Vite + React 19

```ts
// vite.config.ts
import { grabMe } from '@riffle-ai/grab-me/vite'
export default defineConfig({ plugins: [react(), grabMe()] })
```

Add only the plugin: it injects the overlay into `index.html` itself, in `vite` dev only.
Options: `roots`, `stopAfter`, `hosts`.

The adapter expects a Vite app with an `index.html` (a SPA): the plugin mounts the overlay
through `transformIndexHtml`. In an SSR framework built on Vite, that hook may not run and
the overlay will not appear; render `GrabMeOverlay` yourself in a client component with
`viteResolver()` from `@riffle-ai/grab-me/vite/client`, keeping the plugin for its two endpoints.

### React Native (Expo)

Wrap the app's root once. In a development build it adds the picker and a handle the
`grab-me` CLI talks to; in a release build `GrabMe` renders its children only and the picker
is left out of the bundle.

```tsx
// app/_layout.tsx (expo-router), or your root component
import { GrabMe, grabMeMenuItem } from '@riffle-ai/grab-me/native'
import { registerDevMenuItems } from 'expo-dev-menu'

if (__DEV__) registerDevMenuItems([...yourItems, grabMeMenuItem])

export default function RootLayout() {
  return (
    <GrabMe
      stopAfter={['src/ui/']}
      route={() => pathname}
      tokens={() => ({
        color: colors,
        space: tokens.space,
        radius: tokens.radius,
        text: tokens.fontSize,
      })}
    >
      <Stack />
    </GrabMe>
  )
}
```

Expo's dev menu keeps one list of custom items per app and each registration replaces it, so
`grabMeMenuItem` goes into your own list rather than grab-me registering itself. Without
`expo-dev-menu`, React Native's own dev menu shows the same item.

Arm the picker with **Grab me Native** in the dev menu, a hotkey (below) or `grab-me pick`.
Drag to see what is under your finger and lift to copy it; the bar's ↑ / ↓ walk to the parent
and back, **+** adds another element to the snippet and ✕ closes. The snippet goes to the
clipboard (React Native's own clipboard module, or `@react-native-clipboard/clipboard` /
`expo-clipboard` when installed); in the iOS Simulator that is your Mac's clipboard.

```
<grab-me platform="ios" route="/" window="402×874" theme="light">
<Text> "Open"
  jsx: src/ui/status-chip.tsx:29
  rendered by:
    <StatusChip> at src/ui/visit-card.tsx:96
    <VisitCard> at src/features/work-orders/day-list.tsx:106
  box 33×18 · font label (14)/18 Inter_500Medium · color text.primary (#000000)
</grab-me>
```

Owners show where each component is _rendered_ (the JSX call in its parent). Tokens are matched
by value against the objects `tokens` returns, read at grab time so a theme switch is followed.

#### From the terminal, for you or your agent

The `grab-me` command reads the running app through the debugger connection Metro already
serves for React Native DevTools, so it runs beside an open DevTools window and nothing in your
app or Metro config serves it.

| Command                 | Does                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `grab-me screen`        | every text and labelled control in view, top to bottom, with its source |
| `grab-me at X Y`        | the element at a point of the window, in points                         |
| `grab-me pick`          | arm the picker and print the element you tap                            |
| `grab-me arm`           | arm the picker and return at once (for a hotkey)                        |
| `grab-me last`          | the last element grabbed in the app                                     |
| `grab-me raycast [dir]` | write a Raycast script command that runs `grab-me arm`                  |

`--port` picks the Metro port (default `8081`, or `RCT_METRO_PORT`) and `--device` a device by
name when several are connected. `grab-me screen` lets an agent read a screen without a
screenshot:

```
<grab-me-screen platform="ios" route="/" window="402×874" theme="light">
  y310 "Volgende" — <DayList> src/features/work-orders/day-list.tsx:43
  y337 [Bakkerij de Baguette WB-2045] — <DayCard> src/features/work-orders/day-list.tsx:106
  y784 [New log] — <AppNav> src/features/navigation/app-nav.tsx:128
</grab-me-screen>
```

#### A hotkey with Raycast

```sh
pnpm exec grab-me raycast
```

This writes `~/.config/raycast/scripts/grab-me-arm.sh`, a script that arms the picker in the
first app with grab-me on Metro ports 8081–8084. Run it from a project that has the package
installed, not through a one-off `npx` download, so the script points at a copy that stays.
Then, once, in Raycast:

1. Settings (⌘,) → **Extensions** → **+** → **Add Script Directory**, and choose
   `~/.config/raycast/scripts` (in the folder picker, ⌘⇧G and paste the path).
2. Select **Grab me Native** in the list, click **Record Hotkey** and press your shortcut.

The hotkey is global, so pick one your other apps do not need, or accept that it takes over
theirs (⌘G is Find Next in most Mac apps). Running **Grab me Native** from Raycast's search
shows whether arming worked.

Tested with React Native 0.86 and Expo 57 (New Architecture) in the iOS Simulator. Not yet
supported: grabbing inside native sheets and modals (they are presented above the picker), and
Android has not been tried.

## Use (web)

| Gesture  | Does                                        |
| -------- | ------------------------------------------- |
| hold ⌥   | outline what is under the pointer           |
| ⌥-click  | copy it                                     |
| ⌥⇧-click | add or remove it from the set, copy the set |
| ⌥↑ / ⌥↓  | step to the parent / back                   |
| Esc      | clear                                       |

## Options

| Option                     | Default                           |                                                                                                                                    |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `stopAfter`                | `[]`                              | path prefixes of library components (e.g. `['ui/']`): show them, plus two app components                                           |
| `hosts`                    | `localhost`, `127.0.0.1`, `[::1]` | hostnames the overlay turns on for                                                                                                 |
| `roots` (route / plugin)   | whole project                     | folders to search for component definitions                                                                                        |
| `endpoint` (Next)          | `/api/dev/grab-me`                | where `createGrabMeRoute()` is mounted                                                                                             |
| `distDir` (Next)           | `process.env.__NEXT_DIST_DIR`     | Next's absolute dist dir, for a custom `distDir`; Next defines it in dev                                                           |
| `onGrab` (`GrabMeOverlay`) | copy to clipboard                 | `(result, text) => …` for your own handling; `GrabMeOverlay` is exported from the package root, `viteResolver` from `/vite/client` |

The definition search skips `node_modules`, dot-folders and any folder named `build`, `dist`,
`out` or `coverage` at any depth, and does not follow symlinks. Use `roots` to narrow the search
or to point it somewhere else.

## Programmatic

```ts
import { grab, format } from '@riffle-ai/grab-me'
const result = await grab([element]) // structured: elements, owners, styles, warnings
format(result) // the <grab-me> text
```

`grab()` runs in any build. Without React's dev build it keeps what the DOM can tell: tag,
attributes, text, styles and tokens.

## How it works

React 19's dev build keeps each element's owner and JSX call stack. grab-me reads them,
asks your dev server to map the stack back to source (Next's own endpoint, or Vite's
module graph), and finds component definitions by name in your source. Anything it cannot
see (a failed lookup of source frames or component definitions) appears under `warnings:` in
the snippet rather than being dropped. Stylesheets from another origin are skipped by design:
the browser hides their rules, and tokens are read from the page's own.

## Related

[react-grab](https://github.com/aidenybai/react-grab) by Aiden Bai pioneered
click-to-copy context for coding agents. grab-me focuses on design-system codebases:
tokens, server components and multi-element snippets.

## Credits

Built by [Joris Rood](https://github.com/joris-riffle) at [Riffle](https://riffle.so). MIT licensed.

See [RELEASING.md](RELEASING.md) for how a release is made.
