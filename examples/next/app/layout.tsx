import { GrabMe } from '@riffle-ai/grab-me/next'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <GrabMe stopAfter={['components/']} />
      </body>
    </html>
  )
}
