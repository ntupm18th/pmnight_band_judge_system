import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 網址為 https://ntupm18th.github.io/pmnight_band_judge_system/
export default defineConfig({
  base: '/pmnight_band_judge_system/',
  plugins: [react(), tailwindcss()],
});
