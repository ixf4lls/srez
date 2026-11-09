import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mockApiPlugin } from './mocks/plugin';
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'mock' ? [mockApiPlugin()] : [])],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: mode === 'mock' ? {} : { proxy: { '/api': 'http://127.0.0.1:3000' } },
}));
