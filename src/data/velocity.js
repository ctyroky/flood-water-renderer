import Extent from '@arcgis/core/geometry/Extent.js';

// Proven Stage 2 interpretation. Encoding/convention belongs in the adapter.
export function toVelocity(magnitude, publishedDegrees) {
  const angle = publishedDegrees * Math.PI / 180;
  return [magnitude*Math.sin(angle), magnitude*Math.cos(angle)];
}

export async function fetchVelocityField(layer, sampling, flowConfig, signal) {
  const requested = new Extent({ ...sampling.extent, spatialReference: {wkid:4326} });
  const started = performance.now();
  const result = await layer.fetchPixels(requested, sampling.width, sampling.height, {
    bandIds: flowConfig.bandIds, interpolation: 'nearest', signal,
  });
  const block = result.pixelBlock;
  const count = sampling.width*sampling.height;
  const pixels = new Float32Array(count*4);
  let valid = 0, min = Infinity, max = -Infinity, sum = 0;
  if (block) {
    if (block.pixels.length !== 2 || block.width !== sampling.width || block.height !== sampling.height) {
      throw new Error('Velocity tile returned unexpected band count/dimensions');
    }
    if (!block.mask && !block.bandMasks?.length) throw new Error('No velocity validity mask returned');
    const e = result.extent ?? requested;
    if (!e.spatialReference.isGeographic || ['xmin','ymin','xmax','ymax'].some(k => Math.abs(e[k]-requested[k])>1e-9)) {
      throw new Error('Velocity tile returned incompatible pixel georeferencing');
    }
    const [magnitudes,directions] = block.pixels;
    for (let i=0;i<count;i++) {
      if ((block.mask && !block.mask[i]) || block.bandMasks?.some(mask=>!mask[i])) continue;
      const m = magnitudes[i], d = directions[i];
      if (!Number.isFinite(m) || !Number.isFinite(d) || m<0) continue;
      const [east,north] = toVelocity(m,d);
      if (!Number.isFinite(Math.fround(east)) || !Number.isFinite(Math.fround(north))) continue;
      pixels.set([east,north,m,1],i*4);
      valid++; min=Math.min(min,m); max=Math.max(max,m); sum+=m;
    }
  }
  // A null PixelBlock is an empty/out-of-source result, not an invented current.
  return { ...sampling, pixels, summary: { validPixels: valid, totalPixels: count,
    magnitude: {min: valid?min:0,max:valid?max:0,mean:valid?sum/valid:0},
    loadMs: performance.now()-started } };
}
