import {ArcGISFloodAdapter} from '../data/ArcGISFloodAdapter.js';
import {FloodWaterRenderer} from './FloodWaterRenderer.js';
import {FloodWaterError} from './errors.js';
function identity(layer){let url=(layer.url??'').replace(/\/$/,'').toLowerCase();if(layer.type==='feature'&&!/\/\d+$/.test(url))url+=`/${layer.layerId}`;return url;}
function resolve(layers,role,type){
 const layer=layers.find(l=>l.type===type&&(role?.layerId?l.id===role.layerId:identity(l)===role?.url?.replace(/\/$/,'').toLowerCase()));
 if(!layer)throw new FloodWaterError('SOURCE_NOT_FOUND',`Configured ${type} role is absent from the host map`);return layer;
}
/** Convenience only: borrows the host view/map, resolves explicit roles, starts water. */
export async function createFloodWaterFromScenario({view,scenario,parameters,options}={}){
 if(!scenario?.id)throw new FloodWaterError('INVALID_CONFIGURATION','A scenario id and explicit source roles are required');
 await view.when();
 const flowLayer=resolve(view.map.allLayers,scenario.flow,'imagery-tile');
 const footprintLayer=resolve(view.map.allLayers,scenario.footprint,'feature');
 resolve(view.map.ground.layers,scenario.surface,'elevation');
 const adapter=new ArcGISFloodAdapter({flowLayer,footprintLayer,ground:view.map.ground,id:scenario.id,
  flowRepresentation:scenario.flow.representation,directionConvention:scenario.flow.flowRepresentation,
  bandIds:scenario.flow.bandIds,coordinates:scenario.coordinates,magnitudeReference:scenario.magnitudeReference,
  tileScheme:scenario.tiles,surface:{demResolution:scenario.surface.demResolution??2,offsetMeters:scenario.surface.offsetMeters??.2}});
 const water=new FloodWaterRenderer({view,adapter,parameters,options:{...scenario.streaming,...options}});
 try{await water.start();return water;}catch(e){water.destroy();throw e;}
}
