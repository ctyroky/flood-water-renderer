import {mkdtemp,cp,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,relative} from 'node:path';
const root=process.cwd();await mkdir('.verification',{recursive:true});const target=await mkdtemp(resolve('.verification/clean-stage5-'));
for(const name of ['src','examples','tests','package.json','package-lock.json','index.html','vite.config.js','vite.lib.config.js','README.md','LICENSE'])await cp(resolve(name),resolve(target,name),{recursive:true});
await mkdir(resolve(target,'docs'),{recursive:true});for(const name of ['architecture.md','data-contract.md'])await cp(resolve('docs',name),resolve(target,'docs',name));
const npm=process.platform==='win32'?'npm.cmd':'npm';
async function run(args){await new Promise((done,fail)=>{const p=spawn(npm,args,{cwd:target,stdio:'inherit',shell:process.platform==='win32'});p.on('error',fail);p.on('exit',code=>code===0?done():fail(new Error(`npm ${args.join(' ')} exited ${code}`)));});}
console.log('Clean directory:',relative(root,target));
await run(['ci','--ignore-scripts','--fetch-retries=0']);await run(['run','build']);await run(['test']);await run(['run','test:types']);await run(['ls','@arcgis/core','--all']);await run(['pack','--json']);
await writeFile(resolve(root,'.verification/stage5-clean-result.json'),JSON.stringify({directory:relative(root,target),cleanInstall:true,build:true,tests:true,types:true,pack:true},null,2));
