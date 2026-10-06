import { ArcGISFloodAdapter } from '../data/ArcGISFloodAdapter.js';
import TiledWaterRenderNode from '../render/TiledWaterRenderNode.js';
import { TileGrid } from './TileGrid.js';
import { TileManager } from './TileManager.js';
import { watchCameraTiles } from './cameraTiles.js';
import { waterParameters } from './parameters.js';

export async function startWater(view,scenario,signal,onError) {
  const grid=new TileGrid(scenario),adapter=new ArcGISFloodAdapter(view,scenario,grid);
  await adapter.initialize(signal);signal.throwIfAborted();
  const {flow,water}=adapter,originalFlow=flow.visible,originalWater=water.visible;
  const panel=document.createElement('div');panel.id='velocity-controls';
  panel.innerHTML=`<strong>Flowing water · Stage 4A</strong>
    <label>Compare <select aria-label="Water comparison">
      <option value="water">Custom water</option><option value="reference">Esri water</option>
      <option value="both">Custom water + FlowRenderer</option>
      ${import.meta.env.DEV?'<option value="gpu">Velocity debug</option>':''}</select></label>
    <label class="water-slider">Flow speed
      <input type="range" aria-label="Flow speed" data-parameter="flowSpeedMultiplier"
        min="0.25" max="5" step="0.05" title="Visual multiplier, not physical velocity"><output></output></label>
    <label class="water-slider">Brightness
      <input type="range" aria-label="Brightness" data-parameter="brightness" min="0.5" max="2" step="0.05"><output></output></label>
    <label class="water-slider">Reflection
      <input type="range" aria-label="Reflection" data-parameter="reflection" min="0" max="2" step="0.05"><output></output></label>
    <label class="water-slider">Water color
      <input type="range" class="water-color" aria-label="Water color" data-parameter="colorPosition"
        min="0" max="1" step="0.01" title="Blue-green → green-gray → muddy brown"><output></output></label>
    <label><input type="checkbox" aria-label="Pause GPU animation"> Pause GPU</label>
    <small class="stream-status" role="status">Starting water streaming…</small>
    <details><summary>Streaming diagnostics</summary><pre></pre></details>`;
  document.body.append(panel);
  let node,disposed=false;
  const update=()=>{
    if(disposed||!node)return;
    node.setActiveTiles([...manager.records.values()].filter(r=>r.required&&r.visible&&r.state==='ready'&&!r.data.empty));
    const s=manager.snapshot();
    panel.querySelector('.stream-status').textContent=`${s.active} water tiles · ${s.loading} loading`+
      (s.failed?` · ${s.failed} failed`:'')+(s.limited?' · zoom closer for full coverage':'');
    panel.querySelector('pre').textContent=`Scenario: ${scenario.title}\nRequired: ${s.required} · Ready: ${s.ready}\n`+
      `Loading: ${s.loading} · Cached: ${s.cached} · Failed: ${s.failed}\nEmpty: ${s.empty}\n`+
      `Velocity requests: ${s.velocityRequests}\nCache hits: ${s.cacheHits} · Evictions: ${s.evictions}\n`+
      `GPU: ${s.gpuMiB.toFixed(1)} MiB · CPU arrays: ${s.residentMiB.toFixed(1)} MiB\n`+
      `Mean velocity: ${s.averageVelocityMs.toFixed(0)} ms\nMean elevation/mesh: ${s.averageSurfaceMs.toFixed(0)} ms`;
  };
  const manager=new TileManager(adapter,scenario.streaming,update,r=>node?.evictTile(r));
  node=new TiledWaterRenderNode({view,records:manager.records,basis:grid.basis,
    magnitudeReference:scenario.magnitudeReference,waterParameters,
    onError(error){water.visible=originalWater;flow.visible=originalFlow;onError(error);}});
  const setMode=mode=>{
    if(!['water','reference','both',...(import.meta.env.DEV?['gpu']:[])].includes(mode))throw new Error('Unknown water mode');
    flow.visible=mode==='both';water.visible=mode==='reference'||mode==='gpu';
    node.setWaterMode(mode!=='gpu');node.setModeEnabled(mode!=='reference');
    panel.querySelector('select').value=mode;
  };
  panel.querySelector('select').addEventListener('change',e=>setMode(e.target.value));
  panel.querySelector('input[type="checkbox"]').addEventListener('change',e=>node.setPaused(e.target.checked));
  for(const input of panel.querySelectorAll('input[type="range"]')) {
    const parameter=input.dataset.parameter;input.value=waterParameters[parameter];
    const apply=()=>{
      const value=input.valueAsNumber;waterParameters[parameter]=value;
      const text=(Number.isInteger(value*10)?value.toFixed(1):value.toFixed(2))+(parameter==='flowSpeedMultiplier'?'×':'');
      input.nextElementSibling.value=text;input.setAttribute('aria-valuetext',text);node.requestRender();
    };
    input.addEventListener('input',apply);apply();
  }
  setMode('water');
  const stopCamera=watchCameraTiles(view,grid,adapter.coverage,scenario.streaming,(tiles,limited)=>manager.setRequired(tiles,limited));
  const controller={scenario,grid,adapter,manager,node,flow,water,waterParameters,setMode,
    snapshot:()=>manager.snapshot(),
    tiles:()=>[...manager.records.values()].map(r=>({id:r.id,state:r.state,required:r.required,visible:r.visible,
      empty:r.data?.empty??false,extent:r.extent,bytes:r.bytes,uploads:r.uploads??0,error:r.error,
      lastUsed:r.lastUsed,lastRenderedFrame:r.lastRenderedFrame})),
    findTile:(longitude,latitude)=>grid.tile(...grid.index(longitude,latitude)),
    dispose(){
      if(disposed)return;disposed=true;stopCamera();manager.dispose();node.destroy();
      water.visible=originalWater;flow.visible=originalFlow;panel.remove();
      if(window.floodWater===controller){delete window.floodWater;delete window.floodVelocity;}
    }};
  if(import.meta.env.DEV){window.floodWater=controller;window.floodVelocity=controller;}
  return controller;
}
