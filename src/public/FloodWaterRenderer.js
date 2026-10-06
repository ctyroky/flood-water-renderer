import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import TiledWaterRenderNode from '../render/TiledWaterRenderNode.js';
import {TileManager} from '../water/TileManager.js';
import {TileGrid} from '../water/TileGrid.js';
import {watchCameraTiles} from '../water/cameraTiles.js';
import {waterParameters} from '../water/parameters.js';
import {validateTile} from '../data/contract.js';
import {streamingDefaults} from './defaults.js';
import {parameterDefaults,mergeParameters} from './parameters.js';
import {FloodWaterError,waterError,abortable,aborted} from './errors.js';
const attachedViews=new WeakMap(),attachedAdapters=new WeakMap();

/** Owns only water resources. Never creates/destroys a host view or source layer. */
export class FloodWaterRenderer {
  #view;#adapter;#options;#parameters;#visual;#state='idle';#node;#manager;#abort;
  #stopCamera;#viewHandle;#pending;#generation=0;#claimed=false;#ready=false;
  #listeners=new Map();#lastError=null;#signature='';#lastMetrics={};#lastRender={};#id=null;
  constructor({view,adapter,parameters={},options={}}={}) {
    if(view?.type!=='3d')throw new FloodWaterError('INVALID_VIEW','An existing SceneView is required');
    if(!adapter?.initialize||!adapter?.loadTile)throw new FloodWaterError('INVALID_ADAPTER','Provide initialize() and loadTile() adapter operations');
    const o={...streamingDefaults,...options};
    for(const [key,value]of Object.entries(o))if(!(key in streamingDefaults)||!Number.isFinite(value)||!Number.isInteger(value)||value<(key==='preload'?0:1))throw new FloodWaterError('INVALID_CONFIGURATION',`Invalid streaming option: ${key}`);
    if(o.maxRequired>o.maxEntries)throw new FloodWaterError('INVALID_CONFIGURATION','maxEntries must be at least maxRequired');
    this.#view=view;this.#adapter=adapter;this.#options=o;
    this.#parameters=mergeParameters(parameterDefaults,parameters);
    this.#visual={...waterParameters,baseColor:[...waterParameters.baseColor]};this.#applyParameters();
  }
  #check(){if(this.#state==='destroyed')throw new FloodWaterError('RENDERER_DESTROYED','This renderer has been destroyed');}
  #applyParameters(){
    const p=this.#parameters;Object.assign(this.#visual,{flowSpeedMultiplier:p.flowSpeed,brightness:p.brightness,
      reflection:p.reflection,colorPosition:p.waterColor,alpha:p.opacity});
    this.#node?.setPaused(p.paused);this.#node?.requestRender();
  }
  setParameters(patch){this.#check();this.#parameters=mergeParameters(this.#parameters,patch);this.#applyParameters();this.#notify();}
  getParameters(){return {...this.#parameters};}
  on(type,listener){
    this.#check();if(!['ready','statuschange','error'].includes(type)||typeof listener!=='function')throw new FloodWaterError('INVALID_EVENT','Use ready, statuschange or error with a listener');
    const set=this.#listeners.get(type)??new Set();set.add(listener);this.#listeners.set(type,set);return ()=>set.delete(listener);
  }
  #emit(type,value){for(const listener of [...(this.#listeners.get(type)??[])])try{listener(value);}catch(error){globalThis.reportError?.(error);}}
  #notify(){
    const status=this.getStatus();
    // No frame-by-frame events: only material residency/lifecycle/error/parameter changes.
    const signature=JSON.stringify([status.state,status.ready,status.tiles,status.memory,status.limited,status.lastError,this.#parameters]);
    if(signature!==this.#signature){this.#signature=signature;this.#emit('statuschange',status);}
  }
  #error(error,fatal,tileId){
    const e=waterError(error,error?.code??(fatal?'GPU_INITIALIZATION_FAILED':'TILE_FAILED'),error?.message,{fatal,tileId});
    e.fatal=fatal;if(tileId)e.tileId=tileId;
    this.#lastError={code:e.code,message:e.message,fatal:e.fatal,...(e.tileId?{tileId:e.tileId}:{})};
    this.#emit('error',e);this.#notify();return e;
  }
  start(){
    try{this.#check();}catch(e){return Promise.reject(e);}
    if(this.#state==='running')return Promise.resolve();
    if(this.#state==='starting')return this.#pending;
    if(this.#view.destroyed)return Promise.reject(new FloodWaterError('INVALID_VIEW','Host SceneView is destroyed'));
    if(attachedViews.has(this.#view))return Promise.reject(new FloodWaterError('VIEW_IN_USE','Only one running water renderer per SceneView is supported'));
    if(attachedAdapters.has(this.#adapter))return Promise.reject(new FloodWaterError('ADAPTER_IN_USE','This adapter is already active; supply a separate adapter'));
    attachedViews.set(this.#view,this);attachedAdapters.set(this.#adapter,this);this.#claimed=true;
    const generation=++this.#generation,abort=this.#abort=new AbortController();
    this.#state='starting';this.#ready=false;this.#lastError=null;this.#lastMetrics={};this.#lastRender={};
    // Defer acquisition so repeated synchronous start() calls share the pending promise.
    this.#pending=Promise.resolve().then(()=>this.#startRun(generation,abort)).catch(error=>{
      if(generation!==this.#generation||abort.signal.aborted)throw aborted();
      const e=waterError(error,error?.code??'INITIALIZATION_FAILED');
      this.#releaseRun();this.#state='error';this.#error(e,true);throw e;
    });
    this.#notify();return this.#pending;
  }
  async #startRun(generation,abort){
    const {signal}=abort;const view=this.#view,adapter=this.#adapter;
    signal.throwIfAborted();
    if(view.destroyed)throw new FloodWaterError('INVALID_VIEW','Host SceneView is destroyed');
    this.#viewHandle=reactiveUtils.watch(()=>view.destroyed,destroyed=>{if(destroyed)this.destroy();});
    await abortable(view.when(),signal);
    signal.throwIfAborted();
    if(view.viewingMode!=='global')throw new FloodWaterError('INVALID_VIEW','Only global SceneView viewing mode is supported');
    const descriptor=await abortable(adapter.initialize({view,signal}),signal);signal.throwIfAborted();
    if(generation!==this.#generation)throw aborted();
    if(!descriptor?.id||!Number.isFinite(descriptor.magnitudeReference)||descriptor.magnitudeReference<=0||
      !['xmin','ymin','xmax','ymax'].every(k=>Number.isFinite(descriptor.coverage?.[k])))throw new FloodWaterError('INVALID_ADAPTER','Adapter returned invalid coverage/frame metadata');
    const grid=new TileGrid(descriptor);this.#id=descriptor.id;
    const update=()=>{
      if(generation!==this.#generation||!this.#node)return;
      this.#node.setActiveTiles([...this.#manager.records.values()].filter(r=>r.required&&r.visible&&r.state==='ready'&&!r.data.empty));
      this.#notify();
    };
    const source={get metrics(){return adapter.metrics;},loadTile:async(tile,s)=>validateTile(await adapter.loadTile(tile,s))};
    this.#manager=new TileManager(source,this.#options,update,r=>this.#node?.evictTile(r),(e,id)=>this.#error(e,false,id));
    let resolveGPU,rejectGPU;
    const gpuReady=new Promise((resolve,reject)=>{resolveGPU=resolve;rejectGPU=reject;});
    this.#node=new TiledWaterRenderNode({view,records:this.#manager.records,basis:grid.basis,
      magnitudeReference:descriptor.magnitudeReference,waterParameters:this.#visual,
      onInitialized:resolveGPU,
      onTileError:(e,id)=>this.#error(waterError(e,'GPU_TILE_FAILED'),false,id),
      onUpdate:()=>{
        if(generation!==this.#generation)return;
        if(!this.#ready&&this.#node.diagnostics.drawCallsLastFrame>0){
          this.#ready=true;if(this.#state==='running')this.#emit('ready',this.getStatus());
        }
        this.#notify();
      },
      onError:e=>{
        const error=waterError(e,'GPU_INITIALIZATION_FAILED','Water GPU pass failed');rejectGPU(error);
        if(this.#state==='running')queueMicrotask(()=>{
          if(generation!==this.#generation)return;this.#releaseRun();this.#state='error';this.#error(error,true);
        });
      }});
    this.#applyParameters();
    this.#stopCamera=watchCameraTiles(view,grid,descriptor.coverage,this.#options,(tiles,limited)=>this.#manager.setRequired(tiles,limited));
    this.#node.requestRender();await abortable(gpuReady,signal);signal.throwIfAborted();
    this.#state='running';this.#notify();if(this.#ready)this.#emit('ready',this.getStatus());
  }
  #releaseRun(){
    this.#abort?.abort();this.#stopCamera?.();this.#stopCamera=null;this.#viewHandle?.remove();this.#viewHandle=null;
    if(this.#manager){this.#lastMetrics=this.#manager.snapshot();this.#manager.dispose();}
    if(this.#node){this.#node.destroy();this.#lastRender={...this.#node.diagnostics};}
    this.#manager=null;this.#node=null;this.#abort=null;this.#ready=false;
    if(this.#claimed){
      this.#adapter.release?.();attachedViews.delete(this.#view);attachedAdapters.delete(this.#adapter);this.#claimed=false;
    }
  }
  stop(){if(this.#state==='destroyed')return;this.#generation++;this.#releaseRun();this.#state='stopped';this.#notify();}
  destroy(){
    if(this.#state==='destroyed')return;this.#generation++;this.#releaseRun();this.#state='destroyed';this.#notify();
    this.#listeners.clear();this.#view=null;this.#adapter=null;this.#pending=null;
  }
  getStatus(){
    const m=this.#manager?.snapshot()??this.#lastMetrics,n=this.#node?.diagnostics??this.#lastRender,active=!!this.#manager;
    return {state:this.#state,ready:this.#ready,scenarioId:this.#id,limited:active&&!!m.limited,
      tiles:Object.fromEntries(['required','ready','loading','cached','failed','empty','active'].map(k=>[k,active?(m[k]??0):0])),
      memory:{approximateCpuBytes:active?Math.round((m.residentMiB??0)*1048576):0,approximateGpuBytes:active?(n.gpuBytes??0):0},
      statistics:{velocityRequests:m.velocityRequests??0,footprintRequests:m.footprintRequests??0,surfaceRequests:m.surfaceRequests??0,
        cacheHits:m.cacheHits??0,evictions:m.evictions??0,cancellations:m.cancellations??0,
        averageVelocityMs:m.averageVelocityMs??0,averageSurfaceMs:m.averageSurfaceMs??0,
        frames:n.frames??0,velocityUploads:n.textureUploads??0,maskUploads:n.waterMaskUploads??0,
        shaderCompilations:n.shaderCompilations??0,disposedTiles:n.disposedTiles??0,
        meanCpuSubmissionMs:(n.cpuSubmissionMs??0)/Math.max(1,n.frames??0)},
      lastError:this.#lastError?{...this.#lastError}:null};
  }
}
