import {FloodWaterRenderer,ArcGISFloodAdapter,createFloodWaterFromScenario,version,type WaterParameters,type FloodWaterStatus,type FloodScenario} from 'flood-water-renderer';
import SceneView from '@arcgis/core/views/SceneView.js';
import ImageryTileLayer from '@arcgis/core/layers/ImageryTileLayer.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import Ground from '@arcgis/core/Ground.js';
declare const view:SceneView,flowLayer:ImageryTileLayer,footprintLayer:FeatureLayer,ground:Ground;
const adapter=new ArcGISFloodAdapter({flowLayer,footprintLayer,ground,flowRepresentation:'vector-magdir',directionConvention:'flow-from',coordinates:{origin:[0,0]},magnitudeReference:30});
const water=new FloodWaterRenderer({view,adapter,parameters:{flowSpeed:2.5}});
water.on('ready',(status:FloodWaterStatus)=>console.log(status.tiles.ready));
water.on('error',error=>console.log(error.code,error.cause));
water.setParameters({waterColor:.65,paused:true});
const p:WaterParameters=water.getParameters();
water.stop();water.destroy();void p;void version;
// @ts-expect-error undocumented parameter
water.setParameters({arbitraryShaderValue:1});
// @ts-expect-error normal API does not expose internal node
water.node.requestRender();
// @ts-expect-error direction convention must be explicit supported metadata
new ArcGISFloodAdapter({flowLayer,footprintLayer,ground,directionConvention:'flow-to'});
declare const scenario:FloodScenario;
void createFloodWaterFromScenario({view,scenario});
