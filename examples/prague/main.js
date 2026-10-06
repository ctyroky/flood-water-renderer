import '@arcgis/core/assets/esri/themes/light/main.css';
import './style.css';
import WebScene from '@arcgis/core/WebScene.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import {createFloodWaterFromScenario} from '../../dist/flood-water-renderer.js';
import {pragueScenario} from './scenario.js';
import {WaterControls} from './controls.js';
const status=document.querySelector('#status');
const scene=new WebScene({portalItem:{id:pragueScenario.webSceneItemId,portal:{url:pragueScenario.portalUrl}}});
const view=new SceneView({container:'app',map:scene});let water,controls,disposed=false;
const show=e=>{status.hidden=false;status.dataset.error='true';status.textContent=`${e.code??'SCENE_ERROR'}: ${e.message}`;};
try{
 await view.when();water=await createFloodWaterFromScenario({view,scenario:pragueScenario});
 if(disposed)water.destroy();else{
  controls=new WaterControls({renderer:water,flowLayer:scene.allLayers.find(l=>l.type==='imagery-tile'),waterLayer:scene.allLayers.find(l=>l.type==='feature')});
  water.on('error',e=>{if(e.fatal)show(e);});status.hidden=true;
  if(import.meta.env.DEV){window.floodWater=water;window.floodScene={scene,view};}
 }
}catch(e){if(!disposed)show(e);}
if(import.meta.hot)import.meta.hot.dispose(()=>{disposed=true;controls?.destroy();water?.destroy();view.destroy();delete window.floodWater;delete window.floodScene;});
