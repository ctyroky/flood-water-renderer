import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import SpatialReference from '@arcgis/core/geometry/SpatialReference.js';
import { toRenderCoordinates } from '@arcgis/core/views/3d/webgl.js';

export async function createSurface(view, tile, grid, footprint, options, signal) {
  const started=performance.now(), cells=grid.options.meshCells;
  const points=[];
  // Global integer vertex indices ensure neighboring boundaries use IDENTICAL inputs.
  for(let row=0;row<=cells;row++) for(let col=0;col<=cells;col++) {
    points.push(grid.coordinate((tile.x*cells+col)/cells,(tile.y*cells+row)/cells));
  }
  const result=await view.map.ground.queryElevation(new Multipoint({
    spatialReference:SpatialReference.WGS84,points,
  }),{demResolution:options.demResolution,returnSampleInfo:true,signal});
  const coords=[];
  for(let i=0;i<points.length;i++) {
    const [x,y,z]=result.geometry.points[i];
    if (result.sampleInfo?.[i].demResolution<0 || !Number.isFinite(z)) {
      const u=(i%(cells+1))/cells,v=Math.floor(i/(cells+1))/cells;
      const col=Math.min(footprint.width-1,Math.floor((footprint.uv[0]+u*footprint.uv[2])*footprint.width));
      const row=Math.min(footprint.height-1,Math.floor((1-footprint.uv[1]-v*footprint.uv[3])*footprint.height));
      if(footprint.pixels[row*footprint.width+col]>0) throw new Error('Missing surface elevation under flooded geometry');
    }
    coords.push(x,y,(Number.isFinite(z)?z:0)+options.offsetMeters);
  }
  const render=new Float64Array(coords.length);
  if(!toRenderCoordinates(view,coords,0,SpatialReference.WGS84,render,0,points.length)) {
    throw new Error('Cannot transform water surface into render coordinates');
  }
  const center=Math.floor(points.length/2)*3, origin=new Float32Array(render.subarray(center,center+3));
  const vertices=new Float32Array(points.length*5);
  for(let i=0;i<points.length;i++) vertices.set([
    render[i*3]-origin[0],render[i*3+1]-origin[1],render[i*3+2]-origin[2],
    (i%(cells+1))/cells,Math.floor(i/(cells+1))/cells],i*5);
  const indices=new Uint16Array(cells*cells*6);
  let index=0;
  for(let y=0;y<cells;y++) for(let x=0;x<cells;x++) {
    const a=y*(cells+1)+x,b=a+1,c=a+cells+1,d=c+1;
    indices.set([a,b,c,b,d,c],index);index+=6;
  }
  return {vertices,indices,origin,basis:grid.basis,
    summary:{cells,vertices:points.length,triangles:indices.length/3,
      offsetMeters:options.offsetMeters,preparationMs:performance.now()-started}};
}
