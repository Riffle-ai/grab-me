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

## Requirements

React 19 in a development build. TypeScript projects need `moduleResolution` set to `bundler`
or `node16` / `nodenext`, because the package exposes subpath exports (`/next`, `/vite`).

## Install

```sh
pnpm add -D @riffle-ai/grab-me
```

### Next.js 16 (App Router)

```tsx
// app/layout.tsx
import { GrabMe } from '@riffle-ai/grab-me/next'
// …inside <body>, after {children}:
;<GrabMe />
```

`<GrabMe />` takes `stopAfter`, `hosts` and `endpoint` (where the route below is mounted;
default `/api/dev/grab-me`). It has no `onGrab`: functions do not cross from a server component,
and the Next resolver is not a public export yet.

```ts
// app/api/dev/grab-me/route.ts
import { createGrabMeRoute } from '@riffle-ai/grab-me/next/route'
export const GET = createGrabMeRoute()
```

`createGrabMeRoute({ roots })` narrows where component definitions are searched.

### Vite + React 19

```ts
// vite.config.ts
import { grabMe } from '@riffle-ai/grab-me/vite'
export default defineConfig({ plugins: [react(), grabMe()] })
```

Add only the plugin: it injects the overlay into `index.html` itself, in `vite` dev only.
Options: `roots`, `stopAfter`, `hosts`.

## Use

| Gesture  | Does                                        |
| -------- | ------------------------------------------- |
| hold ⌥   | outline what is under the pointer           |
| ⌥-click  | copy it                                     |
| ⌥⇧-click | add or remove it from the set, copy the set |
| ⌥↑ / ⌥↓  | step to the parent / back                   |
| Esc      | clear                                       |

## Options

| Option                   | Default                           |                                                                                          |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `stopAfter`              | `[]`                              | path prefixes of library components (e.g. `['ui/']`): show them, plus two app components |
| `hosts`                  | `localhost`, `127.0.0.1`, `[::1]` | hostnames the overlay turns on for                                                       |
| `roots` (route / plugin) | whole project                     | folders to search for component definitions                                              |

The definition search skips `node_modules`, dot-folders and any folder named `build`, `dist`,
`out` or `coverage` at any depth, and does not follow symlinks. Use `roots` to narrow the search
or to point it somewhere else.
| `endpoint` (Next) | `/api/dev/grab-me` | where `createGrabMeRoute()` is mounted |
| `onGrab` (`GrabMeOverlay`) | copy to clipboard | `(result, text) => …` for your own handling; `GrabMeOverlay` is exported from the package root, `viteResolver` from `/vite/client` |

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
see (a failed lookup, an unreadable stylesheet) appears under `warnings:` in the snippet
rather than being dropped.

## Related

[react-grab](https://github.com/aidenybai/react-grab) by Aiden Bai pioneered
click-to-copy context for coding agents. grab-me focuses on design-system codebases:
tokens, server components and multi-element snippets.

## Credits

Built by Joris Rood at Riffle. MIT licensed.
