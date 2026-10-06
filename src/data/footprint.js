// ArcGIS adapter helper. Water geometry and velocity validity are independent.
// flood polygons (including holes) once, at twice the velocity-grid resolution.
// The canvas clips geometry to the bounded extent; no full-area water mesh exists.
export async function createWaterFootprint(layer, sampling, extent, signal) {
  await layer.load({ signal });
  const query = layer.createQuery();
  query.geometry = extent;
  query.spatialRelationship = 'intersects';
  const ids = await layer.queryObjectIds(query, { signal });
  if (!ids?.length) return {empty:true};
  query.returnGeometry = true;
  query.outSpatialReference = extent.spatialReference;
  query.outFields = [layer.objectIdField];
  query.maxAllowableOffset = 0.000002; // < 0.23 m; below mask pixel size.
  const {width,height} = sampling;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  let vertices = 0, features = 0;
  for (let offset = 0; offset < ids.length; offset += 32) {
    query.objectIds = ids.slice(offset, offset + 32);
    const result = await layer.queryFeatures(query, { signal });
    if (result.exceededTransferLimit) throw new Error('Water polygon query was truncated.');
    for (const { geometry } of result.features) {
      if (geometry?.type !== 'polygon' || !geometry.spatialReference.isGeographic) {
        throw new Error('Expected geographic flood polygons.');
      }
      ctx.beginPath();
      for (const ring of geometry.rings) {
        ring.forEach(([lon, lat], i) => {
          const x = (lon - extent.xmin) / extent.width * width;
          const y = (extent.ymax - lat) / extent.height * height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath(); vertices += ring.length;
      }
      ctx.fill('evenodd'); features++;
    }
  }
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height);
  let wet = 0;
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = rgba[i * 4 + 3];
    if (pixels[i] < 128) continue;
    wet++;
  }
  if (!wet) return {empty:true};
  const summary = { source: layer.url, dimensions: [width, height], features, vertices,
    wetPixels: wet, format: 'R8', bytes: pixels.byteLength,
    geometry: 'queried flood polygons, even-odd holes, clipped to padded tile extent' };
  return { ...sampling, pixels, summary };
}
