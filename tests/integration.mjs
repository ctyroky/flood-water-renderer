import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareSeams} from './compare-seams.mjs';
const server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port:5185,strictPort:true},logLevel:'error'});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const report={issues:[],http:[],cycles:[],artifactRequested:false,
 artifactSha256:createHash('sha256').update(await readFile('dist/flood-water-renderer.js')).digest('hex'),
 chrome:browser.version(),node:process.version};
page.on('pageerror',e=>{report.issues.push(e.message);console.log('PAGE',e.message)});
page.on('console',m=>{if(m.type()==='error'&&!/AbortError/.test(m.text())){report.issues.push(m.text());console.log('ERROR',m.text())}});
page.on('response',r=>{if(r.status()>=400)report.http.push(`${r.status()} ${r.url()}`);if(r.url().includes('/dist/flood-water-renderer.js'))report.artifactRequested=true;});
await page.addInitScript(()=>{
 const sets={},counts={};window.waterGLAudit={draws:0,capture:false,tiles:new Map(),snapshot:()=>Object.fromEntries(Object.keys(sets).map(k=>[k,{live:sets[k].size,...counts[k]}]))};
 const proto=WebGL2RenderingContext.prototype;
 for(const type of ['Texture','Buffer','VertexArray','Program','Shader','TransformFeedback']){
  sets[type]=new Set();counts[type]={created:0,deleted:0};const create=proto['create'+type],remove=proto['delete'+type];
  proto['create'+type]=function(...args){const object=create.apply(this,args);if(new Error().stack.includes('/dist/flood-water-renderer.js')){sets[type].add(object);counts[type].created++;}return object;};
  proto['delete'+type]=function(object){if(sets[type].delete(object))counts[type].deleted++;return remove.call(this,object);};
 }
 const draw=proto.drawElements;proto.drawElements=function(...args){
  if(new Error().stack.includes('/dist/flood-water-renderer.js')){
   window.waterGLAudit.draws++;
   if(window.waterGLAudit.capture){
    const p=this.getParameter(this.CURRENT_PROGRAM),uniforms={};
    for(let i=0;i<this.getProgramParameter(p,this.ACTIVE_UNIFORMS);i++){const info=this.getActiveUniform(p,i);uniforms[info.name]=this.getUniform(p,this.getUniformLocation(p,info.name));}
    const active=this.getParameter(this.ACTIVE_TEXTURE);this.activeTexture(this.TEXTURE0);const velocity=this.getParameter(this.TEXTURE_BINDING_2D);this.activeTexture(this.TEXTURE1);const footprint=this.getParameter(this.TEXTURE_BINDING_2D);this.activeTexture(active);
    window.waterGLAudit.tiles.set(Array.from(uniforms.uWorldOffset).join(','),{gl:this,program:p,uniforms,velocity,footprint});
   }
  }return draw.apply(this,args);
 };
});
async function settle(){await page.waitForTimeout(600);await page.waitForFunction(()=>{const s=minimalHost.water.getStatus();return s.state==='running'&&s.ready&&s.tiles.required>0&&s.tiles.loading===0&&s.statistics.velocityUploads>0},null,{timeout:180000});await page.waitForTimeout(500);}
async function camera(lon,lat,z=1200,heading=0,tilt=0){await page.evaluate(([longitude,latitude,z,heading,tilt])=>{minimalHost.view.camera={position:{longitude,latitude,z},heading,tilt}},[lon,lat,z,heading,tilt]);await settle();}
try{
 await mkdir('docs/stage5',{recursive:true});
 await page.goto('http://127.0.0.1:5185/examples/minimal/');
 await page.waitForFunction(()=>window.minimalHost,null,{timeout:180000});await camera(14.4125,50.0815);
 report.initial=await page.evaluate(()=>({status:minimalHost.water.getStatus(),gl:waterGLAudit.snapshot()}));console.log('INITIAL',JSON.stringify(report.initial));
 assert.ok(report.artifactRequested);assert.equal(report.initial.status.tiles.failed,0);
 const checks=await page.evaluate(async()=>{
 const {FloodWaterRenderer}=await import('/dist/flood-water-renderer.js');const w=minimalHost.water;
 const before=w.getStatus();await Promise.all([w.start(),w.start()]);
 const other=new FloodWaterRenderer({view:minimalHost.view,adapter:{initialize(){},loadTile(){}}});let duplicate;
 try{await other.start()}catch(e){duplicate=e.code}other.destroy();
 let invalid;const p=w.getParameters();try{w.setParameters({waterColor:.7,flowSpeed:9})}catch(e){invalid=e.code}
 const unchanged=JSON.stringify(p)===JSON.stringify(w.getParameters());
 w.setParameters({paused:true,waterColor:.7,flowSpeed:4,brightness:1.5,reflection:1.7});
 return {before,duplicate,invalid,unchanged};});
 assert.equal(checks.duplicate,'VIEW_IN_USE');assert.equal(checks.invalid,'INVALID_PARAMETER');assert.ok(checks.unchanged);
 await page.waitForTimeout(600);report.controls=await page.evaluate(()=>minimalHost.water.getStatus());assert.equal(report.controls.statistics.velocityUploads,checks.before.statistics.velocityUploads);assert.equal(report.controls.statistics.velocityRequests,checks.before.statistics.velocityRequests);
 await page.screenshot({path:'docs/stage5/minimal-central.png'});
 await page.evaluate(()=>{waterGLAudit.capture=true;minimalHost.water.setParameters({paused:true})});
 await page.waitForFunction(()=>waterGLAudit.tiles.size>=4);
 report.gpuSeams=await page.evaluate(compareSeams);
 assert.ok(report.gpuSeams.samples>0);assert.equal(report.gpuSeams.maxRGBAError,0);assert.equal(report.gpuSeams.glError,0);
 await camera(14.4125,50.0835);report.nearby=await page.evaluate(()=>minimalHost.water.getStatus());await camera(14.4125,50.0815);report.returned=await page.evaluate(()=>minimalHost.water.getStatus());assert.equal(report.nearby.statistics.velocityRequests,report.returned.statistics.velocityRequests);
 await camera(14.413,50.085,420,185,62);await page.screenshot({path:'docs/stage5/minimal-oblique.png'});
 await camera(14.437,50.11);report.north=await page.evaluate(()=>minimalHost.water.getStatus());await page.screenshot({path:'docs/stage5/minimal-north.png'});
 for(let cycle=0;cycle<3;cycle++){
  if(cycle===0){
   await page.evaluate(()=>{minimalHost.view.camera={position:{longitude:14.399,latitude:50.02,z:1200},heading:0,tilt:0}});
   await page.waitForFunction(()=>minimalHost.water.getStatus().tiles.loading>0,null,{timeout:60000});
  }
  const before=await page.evaluate(()=>({s:minimalHost.water.getStatus(),g:waterGLAudit.snapshot()}));
  await page.evaluate(()=>{minimalHost.water.destroy();minimalHost.water.destroy();window.drawsAtDestroy=waterGLAudit.draws;});
  await page.evaluate(c=>{minimalHost.view.camera={position:{longitude:14.414+c*.001,latitude:50.058,z:1200},heading:0,tilt:0}},cycle);
  await page.waitForTimeout(1000);
  const after=await page.evaluate(async()=>{let code;try{await minimalHost.water.start()}catch(e){code=e.code}return {s:minimalHost.water.getStatus(),g:waterGLAudit.snapshot(),viewUsable:minimalHost.view.ready&&!minimalHost.view.destroyed,drawsAfterDestroy:waterGLAudit.draws-window.drawsAtDestroy,code};});
  assert.ok(after.viewUsable);assert.equal(after.drawsAfterDestroy,0);assert.equal(after.code,'RENDERER_DESTROYED');assert.equal(after.s.memory.approximateGpuBytes,0);assert.ok(Object.values(after.g).every(v=>v.live===0));
  await page.evaluate(()=>minimalHost.attachWater());await settle();report.cycles.push({before,after,restarted:await page.evaluate(()=>minimalHost.water.getStatus())});console.log('CYCLE',cycle,'passed');
 }
 // stop() is restartable, releases resources, preserves parameters; cancellation too.
 report.stop=await page.evaluate(()=>{const w=minimalHost.water,p=w.getParameters();w.stop();return {status:w.getStatus(),gl:waterGLAudit.snapshot(),p}});assert.ok(Object.values(report.stop.gl).every(v=>v.live===0));
 report.cancel=await page.evaluate(async()=>{const w=minimalHost.water;const a=w.start(),b=w.start(),same=a===b;w.stop();const r=await Promise.allSettled([a,b]);return {same,codes:r.map(x=>x.reason?.code),status:w.getStatus()}});assert.ok(report.cancel.same);assert.deepEqual(report.cancel.codes,['ABORTED','ABORTED']);
 await page.evaluate(()=>minimalHost.water.start());await settle();assert.deepEqual(await page.evaluate(()=>minimalHost.water.getParameters()),report.stop.p);
 report.final=await page.evaluate(()=>({status:minimalHost.water.getStatus(),gl:waterGLAudit.snapshot()}));
 assert.equal(report.final.status.statistics.shaderCompilations,1);assert.equal(report.final.status.tiles.failed,0);
 await page.evaluate(()=>minimalHost.water.destroy());
 report.initializationError=await page.evaluate(async()=>{
  const {FloodWaterRenderer}=await import('/dist/flood-water-renderer.js');let event;
  const w=new FloodWaterRenderer({view:minimalHost.view,adapter:{async initialize(){throw new Error('Deliberate initialization failure')},async loadTile(){throw new Error('Unexpected acquisition')}}});
  w.on('error',e=>{event={code:e.code,fatal:e.fatal,cause:e.cause?.message}});
  let code;try{await w.start()}catch(e){code=e.code}const status=w.getStatus();w.destroy();return {code,event,status};
 });
 assert.equal(report.initializationError.code,'INITIALIZATION_FAILED');assert.ok(report.initializationError.event.fatal);
 assert.equal(report.initializationError.status.state,'error');assert.deepEqual(report.issues,[]);assert.deepEqual(report.http,[]);
 console.log('PASS',JSON.stringify(report.final.status));
}finally{await writeFile('docs/stage5/integration.json',JSON.stringify(report,null,2));await browser.close();await server.close();}

