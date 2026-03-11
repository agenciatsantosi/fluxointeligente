import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Polyfill process.env to avoid "ReferenceError: process is not defined" in the browser
      // and inject API_KEY if available.
      'process.env': {
        API_KEY: env.API_KEY || ''
      }
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})