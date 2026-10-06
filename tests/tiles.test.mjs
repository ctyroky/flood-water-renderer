import test from 'node:test';
import assert from 'node:assert/strict';
import {TileGrid} from '../src/water/TileGrid.js';
import {TileManager} from '../src/water/TileManager.js';
import {pragueScenario} from '../examples/prague/scenario.js';
import {waterColor} from '../src/water/parameters.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('fixed grid shares exact boundary coordinates and scenario-specific keys',()=>{
 const g=new TileGrid(pragueScenario),a=g.tile(-1,0),b=g.tile(0,0);
 assert.equal(a.extent.xmax,b.extent.xmin);assert.equal(a.worldOffset[0]+a.sizeMeters[0],b.worldOffset[0]);
 assert.deepEqual(g.index(...g.coordinate(.5,.5)),[0,0]);
 const aa=g.sampling(a,384,2),bb=g.sampling(b,384,2);
 const dx=(aa.extent.xmax-aa.extent.xmin)/388;
 assert.ok(Math.abs(aa.extent.xmin+384*dx-bb.extent.xmin)<1e-12);
 assert.notEqual(new TileGrid({...pragueScenario,id:'different-identity'}).tile(0,0).id,b.id);
});
test('water color preserves baseline and interpolates without changing shared parameters',()=>{
 const c=new Float32Array(3);waterColor(.45,c);assert.ok(Math.abs(c[0]-.25)<1e-7);
 waterColor(0,c);assert.ok(c[2]>c[0]);waterColor(1,c);assert.ok(c[0]>c[2]);
});
// Resource lifecycle stubs, not a hydraulic scenario or synthetic flow field.
test('cache deduplicates, reuses, evicts and ignores cancelled asynchronous results',async()=>{
 const pending=[],evicted=[];let calls=0;
 const adapter={scenario:{id:'unit'},metrics:{},loadTile:(r,signal)=>{calls++;return new Promise(resolve=>pending.push({r,signal,resolve}));}};
 const manager=new TileManager(adapter,{concurrency:1,maxBytes:10,maxEntries:3,idleMs:100000},()=>{},r=>evicted.push(r.id));
 const a={id:'a',visible:true},b={id:'b',visible:true};
 try{
 manager.setRequired([a]);manager.setRequired([a]);assert.equal(calls,1);
 pending.shift().resolve({bytes:6});await tick();assert.equal(manager.records.get('a').state,'ready');
 manager.setRequired([a]);assert.equal(calls,1);assert.ok(manager.metrics.cacheHits>0);
 manager.setRequired([b]);pending.shift().resolve({bytes:6});await tick();assert.deepEqual(evicted,['a']);
 manager.setRequired([a]);const obsolete=pending.shift();manager.setRequired([b]);assert.ok(obsolete.signal.aborted);
 obsolete.resolve({bytes:6});await tick();assert.equal(manager.records.get('a').data,null);
 assert.equal(manager.records.get('b').state,'ready');
 }finally{manager.dispose();}
 assert.equal(manager.records.size,0);
});
test('one failed resource does not block another tile and retry is bounded',async()=>{
 const adapter={scenario:{id:'unit'},metrics:{},async loadTile(r){if(r.id==='bad')throw new Error('expected unit failure');return {bytes:1};}};
 const m=new TileManager(adapter,{concurrency:2,maxBytes:10,maxEntries:3,idleMs:100000},()=>{},()=>{});
 try{m.setRequired([{id:'bad'},{id:'good'}]);await tick();assert.equal(m.records.get('bad').state,'error');assert.equal(m.records.get('good').state,'ready');
 for(let i=0;i<3;i++){m.records.get('bad').retryAt=0;m.pump();await tick();}assert.equal(m.records.get('bad').attempts,3);
 }finally{m.dispose();}
});

