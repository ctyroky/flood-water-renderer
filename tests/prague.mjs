import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port:5187,strictPort:true},logLevel:'error'});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const issues=[];
page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/AbortError/.test(m.text()))issues.push(m.text())});
const report={};
try{
 await page.goto('http://127.0.0.1:5187/');await page.waitForFunction(()=>window.floodWater?.getStatus().ready,null,{timeout:180000});
 await page.evaluate(()=>{floodScene.view.camera={position:{longitude:14.4125,latitude:50.0815,z:1200},heading:0,tilt:0}});await page.waitForTimeout(600);await page.waitForFunction(()=>floodWater.getStatus().tiles.loading===0,null,{timeout:180000});
 // Loading can finish one frame before the last queued GPU upload.
 await page.waitForTimeout(1000);
 report.baseline=await page.evaluate(()=>floodWater.getStatus());
 for(const [label,value]of Object.entries({'Flow speed':2.5,'Brightness':1.4,'Reflection':1.5,'Water color':.65}))await page.getByRole('slider',{name:label,exact:true}).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))},String(value));
 await page.getByRole('checkbox',{name:'Pause GPU animation'}).check();await page.waitForTimeout(300);
 report.updated=await page.evaluate(()=>({status:floodWater.getStatus(),parameters:floodWater.getParameters()}));assert.equal(report.updated.status.statistics.velocityRequests,report.baseline.statistics.velocityRequests);assert.equal(report.updated.status.statistics.velocityUploads,report.baseline.statistics.velocityUploads);
 await page.selectOption('select','reference');assert.equal(await page.evaluate(()=>floodWater.getStatus().state),'stopped');
 await page.selectOption('select','both');await page.waitForFunction(()=>floodWater.getStatus().ready,null,{timeout:180000});
 report.both=await page.evaluate(()=>({flow:floodScene.scene.allLayers.find(l=>l.type==='imagery-tile').visible,water:floodScene.scene.allLayers.find(l=>l.type==='feature').visible}));assert.equal(report.both.flow,true);assert.equal(report.both.water,false);
 await page.selectOption('select','water');
 await page.waitForFunction(()=>floodWater.getStatus().tiles.loading===0,null,{timeout:180000});await page.waitForTimeout(1000);
 await page.screenshot({path:'docs/stage5/prague-controls.png'});report.issues=issues;assert.deepEqual(issues,[]);console.log('DEMO PASS');
}finally{await writeFile('docs/stage5/prague.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
