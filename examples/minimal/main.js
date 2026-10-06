import '@arcgis/core/assets/esri/themes/light/main.css';
import './style.css';
import WebScene from '@arcgis/core/WebScene.js';
import SceneView from '@arcgis/core/views/SceneView.js';
// The actual distributable, not src/ or renderer internals.
import {ArcGISFloodAdapter,FloodWaterRenderer} from '../../dist/flood-water-renderer.js';
import {pragueScenario as scenario} from '../prague/scenario.js'; // Example data only.
const scene=new WebScene({portalItem:{id:scenario.webSceneItemId,portal:{url:scenario.portalUrl}}});
const view=new SceneView({container:'view',map:scene});const status=document.querySelector('#status');
let water,original,flowLayer,footprintLayer;
export async function attachWater(){
 // These are host-owned objects already in the scene; no duplicate Layer instances.
 const adapter=new ArcGISFloodAdapter({flowLayer,footprintLayer,ground:scene.ground,
  id:scenario.id,flowRepresentation:'vector-magdir',directionConvention:'flow-from',
  coordinates:scenario.coordinates,magnitudeReference:scenario.magnitudeReference});
 const renderer=new FloodWaterRenderer({view,adapter});
 renderer.on('statuschange',s=>{status.textContent=`${s.state}: ${s.tiles.active} water tiles, ${s.tiles.loading} loading`;});
 renderer.on('error',e=>{status.textContent=`${e.code}: ${e.message}`;if(e.fatal)restore();});
 try{await renderer.start();}catch(e){renderer.destroy();throw e;}
 footprintLayer.visible=false;flowLayer.visible=false; // Explicit host choice.
 renderer.setParameters({flowSpeed:2.5,brightness:1.4,reflection:1.5,waterColor:.45});
 water=renderer;return renderer;
}
function restore(){if(original){flowLayer.visible=original.flow;footprintLayer.visible=original.water;}}
function detachWater(){water?.destroy();restore();}
try{
 await view.when();await scene.loadAll();
 flowLayer=scene.allLayers.find(l=>l.type==='imagery-tile'&&l.url===scenario.flow.url);
 footprintLayer=scene.allLayers.find(l=>l.type==='feature'&&l.url.replace(/\/0$/,'')===scenario.footprint.url.replace(/\/0$/,''));
 original={flow:flowLayer.visible,water:footprintLayer.visible};await attachWater();
 // Host handles for integration tests; only public library operations are exposed.
 window.minimalHost={view,scene,get water(){return water;},attachWater,detachWater,flowLayer,footprintLayer};
}catch(e){status.textContent=`${e.code??'SCENE_ERROR'}: ${e.message}`;console.error(e);}
if(import.meta.hot)import.meta.hot.dispose(()=>{detachWater();view.destroy();delete window.minimalHost;});
