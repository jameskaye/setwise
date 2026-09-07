import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:resolve(import.meta.dirname),plugins:[react()],resolve:{alias:{'@':resolve(import.meta.dirname,'..')}},build:{outDir:resolve(import.meta.dirname,'../standalone-dist/client'),emptyOutDir:true}});
