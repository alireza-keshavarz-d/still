import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Still — Focus Time',
        short_name: 'Still',
        description: 'A quiet, offline-first study time tracker.',
        theme_color: '#0b0f0d',
        background_color: '#0b0f0d',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}']
      },
      devOptions: { enabled: false }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/domain/activity.ts', 'src/data/activityMigration.ts', 'src/data/activityRepository.ts', 'src/domain/planning/dateMath.ts', 'src/domain/time.ts', 'src/domain/jalali.ts', 'src/domain/analytics.ts', 'src/domain/planning/validation.ts', 'src/domain/planning/dependencies.ts', 'src/domain/planning/scheduling.ts', 'src/domain/planning/transitions.ts', 'src/data/planningRepository.ts', 'src/application/reminderService.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});