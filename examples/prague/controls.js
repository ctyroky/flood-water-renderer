/** Optional demo UI. Depends only on the documented renderer API. */
export class WaterControls {
 constructor({renderer,flowLayer,waterLayer,container=document.body}) {
  this.renderer=renderer;this.flow=flowLayer;this.water=waterLayer;
  this.original={flow:flowLayer.visible,water:waterLayer.visible};this.mode='water';this.destroyed=false;
  const panel=this.panel=document.createElement('div');panel.id='velocity-controls';
  panel.innerHTML=`<strong>Flowing water · Stage 5</strong>
   <label>Compare <select aria-label="Water comparison"><option value="water">Custom water</option>
   <option value="reference">Esri water</option><option value="both">Custom water + FlowRenderer</option></select></label>
   ${[['Flow speed','flowSpeed',.25,5,.05],['Brightness','brightness',.5,2,.05],['Reflection','reflection',0,2,.05],['Water color','waterColor',0,1,.01]].map(([title,key,min,max,step])=>`<label class="water-slider">${title}<input type="range" aria-label="${title}" data-key="${key}" class="${key==='waterColor'?'water-color':''}" min="${min}" max="${max}" step="${step}"><output></output></label>`).join('')}
   <label><input type="checkbox" aria-label="Pause GPU animation"> Pause GPU</label>
   <small role="status"></small><details><summary>Streaming diagnostics</summary><pre></pre></details>`;
  container.append(panel);
  for(const input of panel.querySelectorAll('input[type="range"]'))input.addEventListener('input',()=>renderer.setParameters({[input.dataset.key]:input.valueAsNumber}));
  panel.querySelector('input[type="checkbox"]').addEventListener('change',e=>renderer.setParameters({paused:e.target.checked}));
  panel.querySelector('select').addEventListener('change',e=>this.setMode(e.target.value));
  this.unsubscribe=renderer.on('statuschange',()=>this.update());
  this.errorOff=renderer.on('error',e=>{if(e.fatal)this.restore();});
  this.update();this.setMode('water');
 }
 update(){
  const s=this.renderer.getStatus(),p=this.renderer.getParameters();
  for(const input of this.panel.querySelectorAll('input[type="range"]')){
   const key=input.dataset.key;input.value=p[key];const text=String(Number(p[key].toFixed(2)))+(key==='flowSpeed'?'×':'');
   input.nextElementSibling.value=text;input.setAttribute('aria-valuetext',text);
  }
  this.panel.querySelector('input[type="checkbox"]').checked=p.paused;
  this.panel.querySelector('small').textContent=`${s.state} · ${s.tiles.active} water tiles · ${s.tiles.loading} loading`+(s.limited?' · zoom closer for full coverage':'');
  this.panel.querySelector('pre').textContent=JSON.stringify({tiles:s.tiles,memory:s.memory,statistics:s.statistics,lastError:s.lastError},null,2);
  if(['stopped','destroyed','error'].includes(s.state))this.restore();
 }
 async setMode(mode){
  this.mode=mode;
  if(mode==='reference'){this.renderer.stop();this.flow.visible=false;this.water.visible=true;}
  else{
   try{await this.renderer.start();if(this.destroyed||this.mode!==mode)return;this.flow.visible=mode==='both';this.water.visible=false;}
   catch(e){if(e.code!=='ABORTED'){this.restore();this.panel.querySelector('small').textContent=e.message;}}
  }
 }
 restore(){this.flow.visible=this.original.flow;this.water.visible=this.original.water;}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.unsubscribe();this.errorOff();this.restore();this.panel.remove();this.renderer=null;this.flow=null;this.water=null;}
}
