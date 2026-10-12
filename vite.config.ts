import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 4174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: { target: 'es2022', rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'supabase', test: /node_modules\/@supabase\// }, { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\// }] } } } },
});
