// grab-me: hold ⌥ and click anything on localhost to copy a reference to it (component,
// source file, tokens) for pasting into Claude Code. Development only: the import sits
// inside the NODE_ENV branch, so a production build never bundles the overlay.
export async function GrabMe() {
  if (process.env.NODE_ENV === 'development') {
    const { GrabMeOverlay } = await import('./overlay')
    return <GrabMeOverlay />
  }
  return null
}
