import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.cwd(),npm=process.platform==='win32'?'npm.cmd':'npm';
async function run(cwd,args){await new Promise((done,fail)=>{const p=spawn(npm,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});p.on('error',fail);p.on('exit',code=>code===0?done():fail(new Error(`npm ${args.join(' ')} exited ${code}`)));});}
await mkdir('.verification',{recursive:true});await run(root,['pack','--pack-destination','.verification','--json']);
const dir=await mkdtemp(resolve('.verification/package-consumer-'));
await writeFile(resolve(dir,'package.json'),JSON.stringify({name:'independent-water-host',private:true,type:'module',scripts:{build:'vite build'},dependencies:{'flood-water-renderer':'file:../flood-water-renderer-0.1.0.tgz','@arcgis/core':'5.1.26'},devDependencies:{vite:'8.3.2'}},null,2));
await copyFile('examples/minimal/index.html',resolve(dir,'index.html'));await copyFile('examples/minimal/style.css',resolve(dir,'style.css'));await copyFile('examples/prague/scenario.js',resolve(dir,'scenario.js'));
const main=(await readFile('examples/minimal/main.js','utf8')).replace('../../dist/flood-water-renderer.js','flood-water-renderer').replace('../prague/scenario.js','./scenario.js');await writeFile(resolve(dir,'main.js'),main);
await run(dir,['install','--ignore-scripts','--fetch-retries=0']);await run(dir,['run','build']);await run(dir,['ls','@arcgis/core','--all']);
const server=await createServer({root:dir,configFile:false,server:{host:'127.0.0.1',port:5186,strictPort:true},logLevel:'error'});await server.listen();
const installed=await readFile(resolve(dir,'node_modules/flood-water-renderer/dist/flood-water-renderer.js'));
assert.deepEqual(installed,await readFile('dist/flood-water-renderer.js'));
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const report={directory:relative(root,dir),issues:[],libraryRequest:false,artifactSha256:createHash('sha256').update(installed).digest('hex')};
page.on('pageerror',e=>report.issues.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/AbortError/.test(m.text()))report.issues.push(m.text());});page.on('request',r=>{if(r.url().includes('flood-water-renderer'))report.libraryRequest=true;});
try{
 await page.goto('http://127.0.0.1:5186/');await page.waitForFunction(()=>window.minimalHost,null,{timeout:180000});await page.evaluate(()=>{minimalHost.view.camera={position:{longitude:14.4125,latitude:50.0815,z:1200},heading:0,tilt:0}});
 await page.waitForFunction(()=>{const s=minimalHost.water.getStatus();return s.ready&&s.tiles.loading===0&&s.tiles.active>0},null,{timeout:180000});report.status=await page.evaluate(()=>minimalHost.water.getStatus());await page.screenshot({path:'docs/stage5/installed-package.png'});assert.equal(report.status.tiles.failed,0);assert.deepEqual(report.issues,[]);assert.ok(report.libraryRequest);console.log('PACKAGE PASS',JSON.stringify(report.status));
}finally{await writeFile('docs/stage5/package-consumer.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
