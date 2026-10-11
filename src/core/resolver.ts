// How the core asks a dev server where things live. Each adapter supplies one; a method
// throws when its server cannot answer, and grab() turns that into a warning.
import type { Frame } from './fiber.js'

export interface Site {
  file: string
  line: number | null
}
export interface Definition {
  file: string
  line: number
}
export interface Resolver {
  /** Bundled frames → the first project frame, relative to the project root. */
  frames(frames: Frame[], server: boolean): Promise<Site | null>
  /** Component names → where they are defined. */
  locate(names: string[]): Promise<Record<string, Definition[]>>
}

export async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what} answered ${res.status}`)
  return res
}
