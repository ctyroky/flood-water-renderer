import {defineConfig} from 'vite';
export default defineConfig({
 resolve:{dedupe:['@arcgis/core']},
 build:{outDir:'demo-dist',emptyOutDir:true,rolldownOptions:{input:{prague:'index.html',minimal:'examples/minimal/index.html'}}},
});
