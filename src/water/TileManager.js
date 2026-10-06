/** Bounded CPU/GPU residency policy. The adapter owns acquisition; node owns GL calls. */
export class TileManager {
  constructor(adapter,options,onChange,onEvict,onError=()=>{}) {
    this.adapter=adapter;this.options=options;this.onChange=onChange;this.onEvict=onEvict;
    this.onError=onError;
    this.records=new Map();this.queue=[];this.inFlight=0;this.disposed=false;
    this.metrics={cacheHits:0,evictions:0,cancellations:0,completed:0,errors:0};
    this.timer=setInterval(()=>{this.trim();this.pump();this.onChange();},2000);
  }
  setRequired(tiles,limited=false) {
    if(this.disposed)return;
    this.limited=limited;
    const wanted=new Set(tiles.map(t=>t.id)),now=performance.now();
    for(const r of this.records.values()) {
      if(r.required&&!wanted.has(r.id)) {r.lastUsed=now;r.controller?.abort();}
      r.required=false;r.visible=false;
    }
    this.queue=tiles.map(tile=>{
      let r=this.records.get(tile.id);
      if(!r) {
        r={...tile,state:'unloaded',lastUsed:now,data:null,gpu:null,attempts:0,bytes:0};
        this.records.set(tile.id,r);
      } else if(r.state==='ready') this.metrics.cacheHits++;
      r.required=true;r.visible=tile.visible;r.lastUsed=now;
      return r;
    });
    this.trim();this.onChange();this.pump();
  }
  residentBytes(){let sum=0;for(const r of this.records.values())sum+=r.bytes;return sum;}
  remove(r) {
    r.controller?.abort();this.onEvict(r);this.records.delete(r.id);this.metrics.evictions++;
  }
  trim(extra=0) {
    const now=performance.now();
    const unused=[...this.records.values()].filter(r=>!r.required&&r.state!=='loading').sort((a,b)=>a.lastUsed-b.lastUsed);
    let bytes=this.residentBytes();
    for(const r of unused) {
      if(bytes+extra>this.options.maxBytes || this.records.size>this.options.maxEntries || now-r.lastUsed>this.options.idleMs) {
        bytes-=r.bytes;this.remove(r);
      }
    }
    return bytes+extra<=this.options.maxBytes;
  }
  pump() {
    if(this.disposed)return;
    for(const r of this.queue) {
      if(this.inFlight>=this.options.concurrency)break;
      if(!r.required || (r.state!=='unloaded' && !(r.state==='error'&&r.attempts<3&&performance.now()>=r.retryAt)))continue;
      r.state='loading';r.attempts++;r.error=null;r.controller=new AbortController();
      const controller=r.controller;this.inFlight++;
      this.adapter.loadTile(r,controller.signal).then(data=>{
        if(this.disposed||controller.signal.aborted)return;
        if(!this.trim(data.bytes-r.bytes)) {
          const error=new Error('Tile residency budget exhausted; zoom closer');error.code='TILE_MEMORY_BUDGET';throw error;
        }
        r.data=data;r.bytes=data.bytes;r.state='ready';r.readyAt=performance.now();
        this.metrics.completed++;
      }).catch(error=>{
        if(this.disposed)return;
        if(controller.signal.aborted || error.name==='AbortError') {r.state='unloaded';r.attempts--;this.metrics.cancellations++;}
        else {
          r.state='error';r.error=error.message;r.retryAt=performance.now()+2000*2**r.attempts;this.metrics.errors++;
          this.onError(error,r.id);
        }
      }).finally(()=>{
        this.inFlight--;r.controller=null;
        if(this.disposed)return;
        if(controller.signal.aborted&&r.state==='loading') {
          r.state='unloaded';r.attempts--;this.metrics.cancellations++;
        }
        this.trim();this.onChange();this.pump();
      });
    }
    this.onChange();
  }
  snapshot() {
    let ready=0,empty=0,loading=0,failed=0,required=0,active=0,gpuBytes=0;
    for(const r of this.records.values()) {
      if(r.required)required++;
      if(r.state==='loading')loading++;
      if(r.state==='error')failed++;
      if(r.state==='ready') {ready++;if(r.data.empty)empty++;else if(r.required&&r.visible)active++;}
      if(r.gpu)gpuBytes+=r.bytes;
    }
    const m={velocityRequests:0,footprintRequests:0,surfaceRequests:0,velocityMs:0,surfaceMs:0,
      velocityCompleted:0,surfaceCompleted:0,...this.adapter.metrics};
    return {required,ready,loading,failed,empty,active,cached:this.records.size,
      gpuMiB:gpuBytes/1048576,residentMiB:this.residentBytes()/1048576,limited:this.limited,
      ...this.metrics,...m,averageVelocityMs:m.velocityMs/Math.max(1,m.velocityCompleted),
      averageSurfaceMs:m.surfaceMs/Math.max(1,m.surfaceCompleted)};
  }
  dispose() {
    this.disposed=true;clearInterval(this.timer);
    for(const r of this.records.values()){r.controller?.abort();this.onEvict(r);}
    this.records.clear();this.queue=[];
  }
}
