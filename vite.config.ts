import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const cspPlugin: Plugin = {
  name: 'flow-lens-environment-csp',
  transformIndexHtml(html, context) {
    const connectSource = context.server
      ? "'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
      : "'none'"
    return html.replace('__FLOW_LENS_CONNECT_SRC__', connectSource)
  },
}

export default defineConfig({
  plugins: [react(), cspPlugin],
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    reportCompressedSize: true,
  },
})
