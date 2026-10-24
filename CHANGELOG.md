# @riffle-ai/grab-me

## 0.2.0

### Minor Changes

- 1db0d30: React Native support: `GrabMe` from `@riffle-ai/grab-me/native` adds a tap-to-grab picker to a development build (armed from the dev menu, a hotkey or the CLI), and the new `grab-me` command reads a running app through Metro's debugger connection: `screen` lists what is on screen with where each piece is written, `at`, `pick`, `arm` and `last` grab elements, and `raycast` writes a Raycast script command so a hotkey arms the picker.

## 0.1.1

### Patch Changes

- The Vite dev endpoints now reject request bodies over 1 MB and map at most the first 50 frames, and a stack frame such as `<anonymous>` no longer turns an all-dependency stack into a warning. Holding ⌥ and pressing a key named like an inherited object property is ignored, and a Next rejection without a reason now says so instead of throwing an empty error.

## 0.1.0

### Minor Changes

- c36f0b6: First release: grab-me as a library, with Next.js 16 and Vite adapters.
