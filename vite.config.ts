import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The repository name the app will live under on GitHub Pages.
// Published URL becomes: https://<username>.github.io/<REPO_NAME>/
// If you name your GitHub repo something else, change this one string.
const REPO_NAME = 'caro-calculator'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // In dev we serve from "/" so the local URL stays short.
  // In a production build every asset URL is prefixed with the repo name,
  // which is what GitHub Pages needs when the site is not at the domain root.
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  server: {
    // WSL / container friendly: listen on all interfaces so the app is
    // reachable from a phone on the same Wi-Fi for real mobile testing.
    host: true,
  },
}))
