import { GrabMe } from '@riffle-ai/grab-me/next'
import { Card } from '../components/card'

// GrabMe sits here rather than in the root layout so /custom can run its own overlay.
export default function Page() {
  return (
    <main style={{ padding: 40 }}>
      <Card />
      <GrabMe stopAfter={['components/']} />
    </main>
  )
}
