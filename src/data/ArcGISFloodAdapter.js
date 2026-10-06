import Extent from '@arcgis/core/geometry/Extent.js';
import {fetchVelocityField} from './velocity.js';
import {createSurface} from './surface.js';
import {createWaterFootprint} from './footprint.js';
import {validateTile} from './contract.js';
import {geographicExtent} from './geographicExtent.js';
import {TileGrid} from '../water/TileGrid.js';
import {tileDefaults} from '../public/defaults.js';
import {FloodWaterError,waterError} from '../public/errors.js';

/** Borrows existing ArcGIS sources. Never changes or destroys those sources. */
export class ArcGISFloodAdapter {
  constructor({flowLayer,footprintLayer,ground,id='arcgis-water',coordinates,magnitudeReference,
    flowRepresentation,directionConvention,bandIds=[0,1],tileScheme={},surface={}}={}) {
    if(flowLayer?.type!=='imagery-tile')throw new FloodWaterError('UNSUPPORTED_FLOW_LAYER','flowLayer must be an ImageryTileLayer');
    if(footprintLayer?.type!=='feature')throw new FloodWaterError('FOOTPRINT_UNAVAILABLE','footprintLayer must be a polygon FeatureLayer');
    if(!ground?.queryElevation)throw new FloodWaterError('ELEVATION_UNAVAILABLE','Provide the host SceneView Ground');
    if(flowRepresentation!=='vector-magdir')throw new FloodWaterError('UNSUPPORTED_FLOW_REPRESENTATION','Only vector-magdir is supported');
    if(directionConvention!=='flow-from')throw new FloodWaterError('INVALID_DIRECTION_CONVENTION','Explicit flow-from interpretation is required');
    if(!Array.isArray(bandIds)||bandIds.join(',')!=='0,1')throw new FloodWaterError('MISSING_BANDS','Expected magnitude band 0 and direction band 1');
    if(!Number.isFinite(magnitudeReference)||magnitudeReference<=0)throw new FloodWaterError('INVALID_CONFIGURATION','Provide a positive scenario-wide magnitudeReference');
    this.flow=flowLayer;this.water=footprintLayer;this.ground=ground;
    this.config={id,coordinates:{origin:[...(coordinates?.origin??[])]},magnitudeReference,tiles:{...tileDefaults,...tileScheme}};
    this.flowConfig={bandIds:[...bandIds]};this.surfaceOptions={demResolution:2,offsetMeters:.20,...surface};
    if(!Number.isFinite(this.surfaceOptions.demResolution)||this.surfaceOptions.demResolution<=0||
       !Number.isFinite(this.surfaceOptions.offsetMeters)||this.surfaceOptions.offsetMeters<0)throw new FloodWaterError('INVALID_CONFIGURATION','Invalid surface resolution/offset');
    try{new TileGrid(this.config);}catch(error){throw waterError(error,'INVALID_CONFIGURATION');}
    this.view=null;this.grid=null;
  }
  async initialize({view,signal}) {
    if(view.map.ground!==this.ground)throw new FloodWaterError('ELEVATION_UNAVAILABLE','Adapter ground must be view.map.ground');
    this.view=view;this.grid=new TileGrid(this.config);
    this.metrics={velocityRequests:0,footprintRequests:0,surfaceRequests:0,velocityMs:0,surfaceMs:0,velocityCompleted:0,surfaceCompleted:0};
    await Promise.all([
      this.flow.load({signal}).catch(e=>{throw waterError(e,'FLOW_UNAVAILABLE','Flow source failed to load');}),
      this.water.load({signal}).catch(e=>{throw waterError(e,'FOOTPRINT_UNAVAILABLE','Footprint source failed to load');}),
      this.ground.load({signal}).catch(e=>{throw waterError(e,'ELEVATION_UNAVAILABLE','Ground failed to load');}),
    ]);
    signal.throwIfAborted();
    const info=this.flow.serviceRasterInfo;
    if(info?.dataType!=='vector-magdir')throw new FloodWaterError('UNSUPPORTED_FLOW_REPRESENTATION','Source metadata must declare Vector-MagDir');
    if(info.bandCount!==2)throw new FloodWaterError('MISSING_BANDS','Source must provide two magnitude/direction bands');
    if(!info.spatialReference?.isGeographic)throw new FloodWaterError('UNSUPPORTED_SPATIAL_REFERENCE','Flow raster must use WGS84 geographic coordinates');
    if(info.spatialReference.wkid!==4326)throw new FloodWaterError('UNSUPPORTED_SPATIAL_REFERENCE','This adapter currently supports EPSG:4326 only');
    if(this.flow.renderer?.type==='flow'&&this.flow.renderer.flowRepresentation!=='flow-from')throw new FloodWaterError('INVALID_DIRECTION_CONVENTION','Existing FlowRenderer disagrees with flow-from metadata');
    if(this.water.geometryType!=='polygon')throw new FloodWaterError('FOOTPRINT_UNAVAILABLE','Footprint source must contain polygons');
    if(this.ground.layers.length!==1||!this.ground.layers.getItemAt(0).visible)throw new FloodWaterError('ELEVATION_UNAVAILABLE','Exactly one active elevation source is required');
    await this.ground.layers.getItemAt(0).load({signal});signal.throwIfAborted();
    return {...this.config,coverage:geographicExtent(this.water.fullExtent).toJSON()};
  }
  async getWaterFootprint(tile,signal) {
    this.metrics.footprintRequests++;
    const s=this.grid.sampling(tile,this.grid.options.footprintSize,this.grid.options.footprintBorder);
    try{return await createWaterFootprint(this.water,s,new Extent({...s.extent,spatialReference:{wkid:4326}}),signal);}
    catch(e){throw waterError(e,'FOOTPRINT_UNAVAILABLE','Footprint tile query failed',{fatal:false,tileId:tile.id});}
  }
  async getVelocityTile(tile,signal) {
    const metrics=this.metrics;metrics.velocityRequests++;
    const s=this.grid.sampling(tile,this.grid.options.velocitySize,this.grid.options.velocityBorder);
    try {
      const field=await fetchVelocityField(this.flow,s,this.flowConfig,signal);
      signal.throwIfAborted();metrics.velocityMs+=field.summary.loadMs;metrics.velocityCompleted++;return field;
    }catch(e){throw waterError(e,'VELOCITY_QUERY_FAILED',e.message,{fatal:false,tileId:tile.id});}
  }
  async getSurfaceElevation(tile,footprint,signal) {
    const metrics=this.metrics;metrics.surfaceRequests++;
    try {
      const surface=await createSurface(this.view,tile,this.grid,footprint,this.surfaceOptions,signal);
      signal.throwIfAborted();metrics.surfaceMs+=surface.summary.preparationMs;metrics.surfaceCompleted++;return surface;
    }catch(e){throw waterError(e,'ELEVATION_QUERY_FAILED','Elevation tile preparation failed',{fatal:false,tileId:tile.id});}
  }
  async loadTile(tile,signal) {
    const started=performance.now(),waterFootprint=await this.getWaterFootprint(tile,signal);
    signal.throwIfAborted();
    if(waterFootprint.empty)return {...tile,empty:true,bytes:0};
    const local=new AbortController(),combined=AbortSignal.any([signal,local.signal]);
    try {
      const [field,surface]=await Promise.all([this.getVelocityTile(tile,combined),this.getSurfaceElevation(tile,waterFootprint,combined)]);
      signal.throwIfAborted();return validateTile({...tile,field,surface,waterFootprint,loadMs:performance.now()-started});
    }catch(error){local.abort();throw error;}
  }
  release(){this.view=null;this.grid=null;}
}
