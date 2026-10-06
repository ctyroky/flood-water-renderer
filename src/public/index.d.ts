import type SceneView from '@arcgis/core/views/SceneView.js';
import type ImageryTileLayer from '@arcgis/core/layers/ImageryTileLayer.js';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import type Ground from '@arcgis/core/Ground.js';

export const version: '0.1.0';
export type FloodWaterState = 'idle'|'starting'|'running'|'stopped'|'error'|'destroyed';
export interface WaterParameters {
  /** Visual multiplier, not a physical unit conversion. 0.25–5; default 1. */
  flowSpeed: number;
  /** Final shading brightness. 0.5–2; default 1. */
  brightness: number;
  /** Fresnel/analytic sky/specular multiplier. 0–2; default 1. */
  reflection: number;
  /** Blue-green (0) to muddy brown (1); default 0.45. */
  waterColor: number;
  /** Surface alpha. 0–1; default 0.96. */
  opacity: number;
  /** Freeze the common animation clock. Data streaming continues. */
  paused: boolean;
}
export interface StreamingOptions {
  concurrency: number; maxRequired: number; maxEntries: number; maxBytes: number;
  idleMs: number; preload: number; debounceMs: number;
}
export interface TileScheme {
  scheme: string; level: number; sizeMeters: number; velocitySize: number;
  velocityBorder: number; footprintSize: number; footprintBorder: number; meshCells: number;
}
export interface GeographicExtent {xmin:number;ymin:number;xmax:number;ymax:number;}
export interface CoordinateFrame {origin:[longitude:number,latitude:number];}
export interface FloodTileRequest {
  id:string;x:number;y:number;level:number;extent:GeographicExtent;
  worldOffset:[number,number];sizeMeters:[number,number];
}
export interface TileTexture<T extends Float32Array|Uint8Array> {
  pixels:T;width:number;height:number;extent:GeographicExtent;
  /** [offsetU, offsetV, scaleU, scaleV], logical SW-up UV to padded SW-up UV. */
  uv:[number,number,number,number];
}
export interface FloodSurface {
  /** XYZ relative to origin, then logical U,V; five Float32 values per vertex. */
  vertices:Float32Array;indices:Uint16Array;origin:Float32Array|Float64Array;
}
export type FloodTile = FloodTileRequest & ({empty:true;bytes:0} | {
  empty?:false;field:TileTexture<Float32Array>;waterFootprint:TileTexture<Uint8Array>;
  surface:FloodSurface;bytes?:number;
});
export interface FloodSourceDescriptor {
  id:string;coordinates:CoordinateFrame;magnitudeReference:number;coverage:GeographicExtent;tiles:TileScheme;
}
/** Extension boundary; normal consumers use ArcGISFloodAdapter. */
export interface FloodDataAdapter {
  initialize(context:{view:SceneView;signal:AbortSignal}):Promise<FloodSourceDescriptor>;
  loadTile(tile:FloodTileRequest,signal:AbortSignal):Promise<FloodTile>;
  /** Release run-specific references; do not destroy borrowed host sources. */
  release?():void;
  metrics?:Partial<Record<'velocityRequests'|'footprintRequests'|'surfaceRequests'|'velocityMs'|'surfaceMs'|'velocityCompleted'|'surfaceCompleted',number>>;
}
export interface ArcGISFloodAdapterOptions {
  flowLayer:ImageryTileLayer;footprintLayer:FeatureLayer;ground:Ground;
  id?:string;coordinates:CoordinateFrame;magnitudeReference:number;
  flowRepresentation:'vector-magdir';directionConvention:'flow-from';bandIds?:[0,1];
  tileScheme?:Partial<TileScheme>;
  surface?:{demResolution?:number;offsetMeters?:number};
}
export class ArcGISFloodAdapter implements FloodDataAdapter {
  constructor(options:ArcGISFloodAdapterOptions);
  initialize(context:{view:SceneView;signal:AbortSignal}):Promise<FloodSourceDescriptor>;
  loadTile(tile:FloodTileRequest,signal:AbortSignal):Promise<FloodTile>;
  release():void;
}
export interface FloodWaterErrorInfo {code:string;message:string;fatal:boolean;tileId?:string;}
export class FloodWaterError extends Error implements FloodWaterErrorInfo {
  constructor(code:string,message:string,options?:{cause?:unknown;fatal?:boolean;tileId?:string});
  code:string;fatal:boolean;tileId?:string;cause?:unknown;
}
export interface FloodWaterStatus {
  state:FloodWaterState;ready:boolean;scenarioId:string|null;limited:boolean;
  tiles:{required:number;ready:number;loading:number;cached:number;failed:number;empty:number;active:number};
  memory:{approximateCpuBytes:number;approximateGpuBytes:number};
  statistics:{velocityRequests:number;footprintRequests:number;surfaceRequests:number;
    cacheHits:number;evictions:number;cancellations:number;averageVelocityMs:number;averageSurfaceMs:number;
    frames:number;velocityUploads:number;maskUploads:number;shaderCompilations:number;disposedTiles:number;meanCpuSubmissionMs:number};
  lastError:FloodWaterErrorInfo|null;
}
export interface FloodWaterRendererOptions {
  view:SceneView;adapter:FloodDataAdapter;parameters?:Partial<WaterParameters>;options?:Partial<StreamingOptions>;
}
export class FloodWaterRenderer {
  constructor(options:FloodWaterRendererOptions);
  /** Idempotent. Resolves after source validation and GPU program initialization, not all tiles. */
  start():Promise<void>;
  /** Cancel and free all run resources. A later start creates a new run/cache. */
  stop():void;
  /** Permanent, idempotent cleanup. Never destroys the host SceneView or layers. */
  destroy():void;
  setParameters(parameters:Partial<WaterParameters>):void;
  getParameters():WaterParameters;
  getStatus():FloodWaterStatus;
  /** Returns an unsubscribe function. Ready fires once per run, at the first water draw. */
  on(type:'ready'|'statuschange',listener:(status:FloodWaterStatus)=>void):()=>void;
  on(type:'error',listener:(error:FloodWaterError)=>void):()=>void;
}
export interface SourceRole {url?:string;/** WebScene Layer.id, not numeric service sublayer. */layerId?:string;}
export interface FloodScenario {
  id:string;title?:string;webSceneItemId?:string;portalUrl?:string;
  flow:SourceRole & {representation:'vector-magdir';flowRepresentation:'flow-from';bandIds?:[0,1];units?:string};
  footprint:SourceRole;surface:SourceRole & {demResolution?:number;offsetMeters?:number};
  coordinates:CoordinateFrame;magnitudeReference:number;tiles?:Partial<TileScheme>;streaming?:Partial<StreamingOptions>;
}
/** Resolves explicit roles in the EXISTING host map and starts the renderer. */
export function createFloodWaterFromScenario(options:{view:SceneView;scenario:FloodScenario;
  parameters?:Partial<WaterParameters>;options?:Partial<StreamingOptions>}):Promise<FloodWaterRenderer>;
