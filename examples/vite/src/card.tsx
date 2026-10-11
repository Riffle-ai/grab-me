import { useState } from 'react'

export function Card() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button
        data-testid="target"
        onClick={() => setCount(count + 1)}
        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink)', padding: 'var(--spacing)' }}
      >
        Save
      </button>
      <span data-testid="count">{count}</span>
    </div>
  )
}
