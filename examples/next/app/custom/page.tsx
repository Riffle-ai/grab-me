import { Card } from '../../components/card'
import { DevGrabLoader } from '../dev-grab-loader'

// The custom-onGrab setup from the README, kept here so `pnpm test:prod` proves it ships nothing.
export default function CustomPage() {
  return (
    <main style={{ padding: 40 }}>
      <Card />
      <DevGrabLoader />
    </main>
  )
}
