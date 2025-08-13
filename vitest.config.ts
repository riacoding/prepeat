import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()], // ← enables @/ resolution
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'], // or whatever you use
    coverage: { reporter: ['text', 'html'] },
  },
})
