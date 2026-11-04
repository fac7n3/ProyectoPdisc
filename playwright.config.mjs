// Pruebas de punta a punta (humo del sitio público, sin login).
// Sirven el dist/ versionado con `vite preview`: es lo mismo que Vercel publica
// y ya trae la URL/clave públicas de Supabase, así que el CI no necesita .env.
//
// Local: usa el Chrome instalado (PW_CHANNEL=chrome, por defecto fuera de CI).
// CI:    `npx playwright install --with-deps chromium` y el Chromium propio.
import { defineConfig } from '@playwright/test';

const PORT = 4173;
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : 'chrome');

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel,
    locale: 'es-AR',
    trace: 'retain-on-failure',
    // Sin ubicación: el home pide geolocalización y el aviso no debe colarse en las pruebas.
    permissions: [],
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/pages/home.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
