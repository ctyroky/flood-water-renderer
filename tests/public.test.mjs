import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeParameters,parameterDefaults} from '../src/public/parameters.js';
import {readFile} from 'node:fs/promises';
import {abortable} from '../src/public/errors.js';
test('already-cancelled initialization consumes an obsolete rejecting promise',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(abortable(Promise.reject(new Error('obsolete source')),controller.signal),e=>e.code==='ABORTED');
});
test('partial parameters are validated atomically and defaults remain independent',()=>{
 const a=mergeParameters(parameterDefaults,{waterColor:.7});assert.equal(a.flowSpeed,1);assert.equal(parameterDefaults.waterColor,.45);
 for(const patch of [{flowSpeed:6},{brightness:NaN},{reflection:-1},{waterColor:Infinity},{paused:1},{unknown:0}])assert.throws(()=>mergeParameters(a,patch),e=>e.code==='INVALID_PARAMETER');
 assert.equal(a.waterColor,.7);
});
test('distribution is self-contained apart from the ArcGIS peer and has no scenario identifiers',async()=>{
 const js=await readFile(new URL('../dist/flood-water-renderer.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/2067a314|MagDir_5160|ZC_5160|teren_hladina5160|14\.4125|50\.0815|Prague|Střeleck/);
 assert.doesNotMatch(js,/from ["'][^"']*\.glsl|fetch\([^)]*\.glsl/);
 const imports=[...js.matchAll(/from ["']([^"']+)["']/g)].map(m=>m[1]);assert.ok(imports.length>0);assert.ok(imports.every(id=>id.startsWith('@arcgis/core/')));
 assert.ok(js.includes('flowingSlope'));assert.ok(Buffer.byteLength(js)<100000);
});
