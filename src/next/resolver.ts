// Resolver for `next dev`: frames through Next's dev-only /__nextjs_original-stack-frames,
// definitions and the project root through the route createGrabMeRoute() serves.
import type { Frame } from '../core/fiber.js'
import { ok, type Resolver, type Site } from '../core/resolver.js'

export interface NextResolverOptions {
  /** Where createGrabMeRoute() is mounted. */
  endpoint?: string
}

interface NextFrame {
  status: string
  value?: { originalStackFrame?: { file?: string; line1?: number; ignored?: boolean } | null }
}

export function projectPath(file: string, root: string | null): string {
  const path = decodeURIComponent(file)
    .replace(/^file:\/\//, '')
    .replace(/^\[project\]\//, '')
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

// Turbopack's trace endpoint rejects http(s) URLs ("Unknown url scheme 'http'", Next 16.2.1)
// but traces the chunk's path on disk, which for `next dev` is <root>/.next/dev/<path after
// /_next/>. Server frames already arrive as file paths and pass through untouched.
export function chunkOnDisk(file: string, root: string | null): string {
  const m = root ? /^https?:\/\/[^/]+\/_next\/([^?#]+)/.exec(file) : null
  return m ? `${root}/.next/dev/${m[1]}` : file
}

const isProjectFile = (file: string) => !file.includes('node_modules') && !file.startsWith('<')

function original(r: NextFrame) {
  const f = r.value?.originalStackFrame
  return r.status === 'fulfilled' && f?.file && !f.ignored ? { file: f.file, line: f.line1 } : null
}

function usable(r: NextFrame, root: string | null): Site | null {
  const f = original(r)
  const file = f && projectPath(f.file, root)
  return f && file && isProjectFile(file) ? { file, line: f.line ?? null } : null
}

function first(data: NextFrame[], root: string | null): Site | null {
  for (const r of data) {
    const site = usable(r, root)
    if (site) return site
  }
  return null
}

export function nextResolver({
  endpoint = '/api/dev/grab-me',
}: NextResolverOptions = {}): Resolver {
  let root: Promise<string | null> | undefined
  const rootOf = () =>
    (root ??= fetch(`${endpoint}?names=`)
      .then((res) => ok(res, endpoint))
      .then((res) => res.headers.get('x-grab-me-root')))

  return {
    async frames(frames: Frame[], server: boolean) {
      const base = await rootOf()
      const res = await fetch('/__nextjs_original-stack-frames', {
        method: 'POST',
        body: JSON.stringify({
          frames: frames.map((f) => ({ ...f, file: chunkOnDisk(f.file, base) })),
          isServer: server,
          isEdgeServer: false,
          isAppDirectory: true,
        }),
      }).then((r) => ok(r, '/__nextjs_original-stack-frames'))
      return first((await res.json()) as NextFrame[], base)
    },
    async locate(names: string[]) {
      const url = `${endpoint}?names=${encodeURIComponent([...new Set(names)].join(','))}`
      return (await ok(await fetch(url), endpoint)).json()
    },
  }
}
