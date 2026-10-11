import { grabMe } from '@riffle-ai/grab-me/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [react(), grabMe()] })
