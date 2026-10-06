/** Renderer data contract, independent of raster encoding and source services. */
export function validateTile(tile) {
  if (tile.empty) return tile;
  for (const name of ['field','waterFootprint']) {
    const texture = tile[name], channels = name === 'field' ? 4 : 1;
    if (!texture || !Number.isInteger(texture.width) || texture.width<1 ||
        !Number.isInteger(texture.height) || texture.height<1 ||
        texture.pixels.length !== texture.width*texture.height*channels ||
        texture.uv?.length !== 4 || !texture.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1)) {
      throw new Error(`Invalid ${name} tile contract`);
    }
  }
  if (!(tile.field.pixels instanceof Float32Array) || !(tile.waterFootprint.pixels instanceof Uint8Array) ||
      !(tile.surface.vertices instanceof Float32Array) || !(tile.surface.indices instanceof Uint16Array) ||
      tile.surface.origin.length!==3 || !tile.surface.origin.every(Number.isFinite) ||
      !tile.surface.vertices.length || tile.surface.vertices.length % 5 !== 0 ||
      !tile.surface.vertices.every(Number.isFinite) ||
      !tile.surface.indices.every(i=>i<tile.surface.vertices.length/5) ||
      tile.worldOffset.length!==2 || !tile.worldOffset.every(Number.isFinite) ||
      tile.sizeMeters.length!==2 || !tile.sizeMeters.every(v=>Number.isFinite(v)&&v>0)) {
    throw new Error('Invalid velocity/geometry contract');
  }
  const pixels=tile.field.pixels;
  for(let i=0;i<pixels.length;i+=4) {
    if(!Number.isFinite(pixels[i]) || !Number.isFinite(pixels[i+1]) ||
       !Number.isFinite(pixels[i+2]) || pixels[i+2]<0 ||
       (pixels[i+3]!==0 && pixels[i+3]!==1) ||
       (pixels[i+3]===0 && (pixels[i]!==0 || pixels[i+1]!==0 || pixels[i+2]!==0))) {
      throw new Error('Invalid velocity values: finite RGBA with zeroed NoData and binary validity required');
    }
  }
  tile.bytes = tile.field.pixels.byteLength + tile.waterFootprint.pixels.byteLength +
    tile.surface.vertices.byteLength + tile.surface.indices.byteLength;
  return tile;
}
