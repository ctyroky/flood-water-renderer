import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import { geographicExtent } from '../data/geographicExtent.js';
import { intersects } from './TileGrid.js';

export function selectCameraTiles(view,grid,coverage,options) {
  const visible=view.visibleArea?.extent ?? view.extent;
  if(!visible)return {tiles:[],limited:false};
  const e=geographicExtent(visible);
  if(!intersects(e,coverage))return {tiles:[],limited:false};
  const [x0,y0]=grid.index(Math.max(e.xmin,coverage.xmin),Math.max(e.ymin,coverage.ymin));
  const [x1,y1]=grid.index(Math.min(e.xmax,coverage.xmax),Math.min(e.ymax,coverage.ymax));
  const focus=view.toMap({x:view.width/2,y:view.height/2}) ?? view.center;
  const [cx,cy]=grid.index(focus.longitude,focus.latitude),tiles=[];
  // Bound enumeration as well as requests when the camera sees the horizon.
  const radius=Math.ceil(Math.sqrt(options.maxRequired))+2;
  const centerX=Math.max(x0,Math.min(x1,cx)),centerY=Math.max(y0,Math.min(y1,cy));
  for(let y=Math.max(y0-options.preload,centerY-radius);y<=Math.min(y1+options.preload,centerY+radius);y++) {
    for(let x=Math.max(x0-options.preload,centerX-radius);x<=Math.min(x1+options.preload,centerX+radius);x++) {
      const tile=grid.tile(x,y);if(!intersects(tile.extent,coverage))continue;
      tile.visible=x>=x0&&x<=x1&&y>=y0&&y<=y1;
      tile.priority=(tile.visible?0:10000)+(x-centerX)**2+(y-centerY)**2;tiles.push(tile);
    }
  }
  tiles.sort((a,b)=>a.priority-b.priority||a.y-b.y||a.x-b.x);
  return {tiles:tiles.slice(0,options.maxRequired),limited:tiles.length>options.maxRequired ||
    x1-x0>radius*2 || y1-y0>radius*2};
}

export function watchCameraTiles(view,grid,coverage,options,onSelection) {
  let timer,previous='';
  const refresh=()=>{
    timer=null;
    const result=selectCameraTiles(view,grid,coverage,options);
    const signature=result.tiles.map(t=>`${t.id}:${t.visible}`).join('|');
    if(signature!==previous){previous=signature;onSelection(result.tiles,result.limited);}
  };
  const handle=reactiveUtils.watch(()=>[view.camera.position.x,view.camera.position.y,view.camera.position.z,
    view.camera.heading,view.camera.tilt,view.width,view.height,view.stationary],()=>{
    if(!timer)timer=setTimeout(refresh,options.debounceMs);
  });
  refresh();
  return ()=>{clearTimeout(timer);handle.remove();};
}
