// Where a JSX call lives, asked of the Metro server the bundle came from. Metro's own
// /symbolicate endpoint (the one RN's LogBox uses) maps bundle frames to source files, so a
// React Native app needs no grab-me route of its own.
import { callSite, type Fiber, type Frame } from '../core/fiber.js'
import type { Site } from '../core/resolver.js'

interface MetroFrame {
  file?: string
  lineNumber?: number | null
  column?: number | null
  methodName?: string
}

/** "http://host:8081/" from a frame of the bundle, which is served by Metro. */
export const serverOf = (file: string) => /^https?:\/\/[^/]+\//.exec(file)?.[0] ?? null

const isProject = (file: string) => !file.includes('/node_modules/') && !file.startsWith('<')

/**
 * Metro answers absolute paths. The project root is the folder that holds the
 * node_modules every library frame passes through, so it is learnt from those frames.
 */
export function rootOf(files: string[]): string | null {
  for (const f of files) {
    const i = f.indexOf('/node_modules/')
    if (i > 0) return f.slice(0, i)
  }
  return null
}

export const relativeTo = (file: string, root: string | null) =>
  root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file

/** The bundle frames of each fiber's JSX call; null where React kept no stack. */
export const sitesOf = (fibers: Array<Fiber | null>) =>
  fibers.map((f) => callSite(f?._debugStack ?? null)?.frames ?? null)

let knownRoot: string | null = null

/** Symbolicates every site in one request; each answers its first project frame. */
export async function resolve(sites: Array<Frame[] | null>): Promise<Array<Site | null>> {
  const flat = sites.flatMap((s) => s ?? [])
  const server = flat.map((f) => serverOf(f.file)).find(Boolean)
  if (!server) return sites.map(() => null)
  const res = await fetch(`${server}symbolicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stack: flat.map((f) => ({
        file: f.file,
        lineNumber: f.line1,
        column: f.column1,
        methodName: f.methodName,
      })),
    }),
  })
  if (!res.ok) throw new Error(`/symbolicate answered ${res.status}`)
  const stack = ((await res.json()) as { stack: MetroFrame[] }).stack
  const files = stack.map((f) => f.file ?? '')
  knownRoot ??= rootOf(files)
  let i = 0
  return sites.map((s) => {
    const n = s?.length ?? 0
    i += n
    return firstProject(stack.slice(i - n, i), knownRoot)
  })
}

function firstProject(frames: MetroFrame[], root: string | null): Site | null {
  const hit = frames.find((f) => f.file && isProject(f.file))
  if (!hit?.file) return null
  return { file: relativeTo(hit.file, root), line: hit.lineNumber ?? null }
}
