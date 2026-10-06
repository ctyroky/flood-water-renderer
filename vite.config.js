import {defineConfig} from 'vite';
export default defineConfig(({mode})=>({
 base:mode==='pages'?'/flood-water-renderer/':'/',
 resolve:{dedupe:['@arcgis/core']},
 build:{outDir:'demo-dist',emptyOutDir:true,rolldownOptions:{input:mode==='pages'?{prague:'index.html'}:{prague:'index.html',minimal:'examples/minimal/index.html'}}},
}));
