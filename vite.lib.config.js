import {defineConfig} from 'vite';
import {copyFile} from 'node:fs/promises';
export default defineConfig({
 build:{outDir:'dist',emptyOutDir:true,lib:{entry:'src/public/index.js',formats:['es'],fileName:()=> 'flood-water-renderer.js'},
   rolldownOptions:{external:id=>id==='@arcgis/core'||id.startsWith('@arcgis/core/')}},
 plugins:[{name:'public-types',async closeBundle(){await copyFile('src/public/index.d.ts','dist/flood-water-renderer.d.ts');}}],
});
