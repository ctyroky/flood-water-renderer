// Read-only inspection through public SDK properties and methods.
const json = (value) => value == null ? null
  : JSON.parse(JSON.stringify(value.toJSON ? value.toJSON() : value));
const pick = (object, keys) => Object.fromEntries(keys
  .filter((key) => object?.[key] !== undefined)
  .map((key) => [key, json(object[key])]));
const items = (collection) => collection ? Array.from(collection) : [];

function symbols(renderer) {
  return [renderer?.symbol, renderer?.defaultSymbol,
    ...items(renderer?.uniqueValueInfos).map((info) => info.symbol),
    ...items(renderer?.classBreakInfos).map((info) => info.symbol)].filter(Boolean);
}

function rasterSummary(layer) {
  const info = layer.serviceRasterInfo ?? layer.rasterInfo;
  return {
    ...pick(info, ['dataType', 'bandCount', 'pixelType', 'pixelSize', 'spatialReference',
      'extent', 'noDataValue', 'statistics', 'keyProperties', 'multidimensionalInfo']),
    service: pick(layer.sourceJSON, ['serviceDataType', 'bandCount', 'bandNames',
      'pixelType', 'pixelSizeX', 'pixelSizeY', 'minValues', 'maxValues', 'meanValues',
      'units', 'unit', 'datasetFormat', 'compressionType', 'capabilities',
      'hasMultidimensions', 'allowAnalysis', 'allowCopy', 'allowRasterFunction',
      'exportTilesAllowed']),
    ...pick(layer, ['bandIds', 'interpolation', 'rasterFunction',
      'multidimensionalDefinition', 'timeInfo']),
  };
}

// A bounded diagnostic probe, not a hydrodynamic renderer. Request both source
// bands explicitly; the saved display bandIds can contain only [0].
async function probePixels(layer) {
  if (typeof layer.fetchPixels !== 'function') return { status: 'fetchPixels unavailable' };
  const extent = (layer.serviceRasterInfo?.extent ?? layer.fullExtent)?.clone();
  if (!extent) return { status: 'No raster extent available' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const { pixelBlock, extent: resultExtent } = await layer.fetchPixels(extent, 128, 128, {
      bandIds: [0, 1], interpolation: 'nearest', signal: controller.signal,
    });
    if (!pixelBlock) return { status: 'No pixels returned' };
    const bands = pixelBlock.pixels ?? [];
    const samples = [];
    let validPixels = 0;
    for (let index = 0; index < pixelBlock.width * pixelBlock.height; index++) {
      if (pixelBlock.mask && !pixelBlock.mask[index]) continue;
      if (pixelBlock.bandMasks?.some((mask) => !mask[index])) continue;
      const values = bands.map((band) => band[index]);
      if (!values.every(Number.isFinite)) continue;
      validPixels++;
      if (samples.length < 5) samples.push({ index, values });
    }
    return { status: 'ok', extent: json(resultExtent ?? extent),
      width: pixelBlock.width, height: pixelBlock.height, bandCount: bands.length,
      pixelType: pixelBlock.pixelType, hasMask: !!pixelBlock.mask, validPixels, samples,
      note: 'Coarse nearest-neighbor inspection only; not native-resolution statistics.' };
  } catch (error) {
    return { status: 'failed', message: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectScene(scene, view) {
  const report = {
    webScene: {
      id: scene.portalItem.id, title: scene.portalItem.title,
      portal: scene.portalItem.portal.url,
      spatialReference: json(view.spatialReference),
      savedViewpoint: json(scene.initialViewProperties?.viewpoint),
      camera: json(view.camera), environment: json(view.environment),
      heightModelInfo: json(scene.heightModelInfo),
    },
    layers: [], waterLayers: [], flowLayers: [], rasterLayers: [], groundLayers: [], errors: [],
  };
  const seen = new Set();
  async function visit(layer, parent, parentVisible = true) {
    if (seen.has(layer)) return;
    seen.add(layer);
    const path = `${parent} / ${layer.title ?? layer.id}`;
    try { if (layer.load) await layer.load(); }
    catch (error) { report.errors.push({ path, message: error.message }); }
    const renderer = layer.renderer;
    const symbolLayers = symbols(renderer).flatMap((symbol) => items(symbol.symbolLayers));
    const water = symbolLayers.filter((symbol) => symbol.type === 'water');
    const raster = layer.type === 'imagery' || layer.type === 'imagery-tile';
    const entry = {
      path, ...pick(layer, ['id', 'title', 'type', 'declaredClass', 'loadStatus',
        'visible', 'opacity', 'minScale', 'maxScale', 'geometryType', 'hasZ', 'hasM', 'layerId']),
      effectiveVisibility: parentVisible && layer.visible !== false,
      source: layer.url && layer.layerId != null && /\/(FeatureServer|MapServer)$/i.test(layer.url)
        ? `${layer.url}/${layer.layerId}`
        : layer.url ?? layer.portalItem?.id ?? layer.source?.type ?? null,
      portalItemId: layer.portalItem?.id ?? null,
      renderer: renderer ? { type: renderer.type, configuration: json(renderer) } : null,
      symbols: symbols(renderer).map((symbol) => ({ type: symbol.type,
        layers: items(symbol.symbolLayers).map((part) => ({ type: part.type,
          ...pick(part, ['waterbodySize', 'waveDirection', 'waveStrength', 'color', 'material']) })) })),
      elevation: json(layer.elevationInfo),
      fields: items(layer.fields).map((field) => pick(field, ['name', 'alias', 'type'])),
    };
    report.layers.push(entry);
    if (water.length) report.waterLayers.push(entry);
    if (parent.startsWith('ground')) report.groundLayers.push(entry);
    if (raster || layer.type === 'elevation') {
      entry.raster = rasterSummary(layer);
      report.rasterLayers.push(entry);
    }
    if (renderer?.type === 'flow') {
      const dataType = entry.raster?.dataType ?? entry.raster?.service?.serviceDataType ?? '';
      const magDir = /magdir/i.test(dataType);
      const uv = /vector[-_]uv/i.test(dataType);
      entry.flow = {
        ...pick(renderer, ['flowRepresentation', 'flowSpeed', 'density', 'trailLength',
          'trailWidth', 'maxPathLength', 'trailCap', 'color', 'visualVariables']),
        encoding: dataType || 'Not exposed',
        velocitySource: magDir ? 'Band 0 (band 1 in one-based indexing): magnitude'
          : uv ? 'Magnitude derived from U and V bands' : 'Unconfirmed',
        directionSource: magDir ? 'Band 1 (band 2 in one-based indexing): direction'
          : uv ? 'Direction derived from U and V bands' : 'Unconfirmed',
        units: entry.raster?.service?.units ?? entry.raster?.keyProperties?.Unit
          ?? 'Not declared; do not infer velocity units from renderer settings',
        pixelProbe: await probePixels(layer),
      };
      report.flowLayers.push(entry);
    }
    // Covers GroupLayers, map-image sublayers, and building sublayer trees.
    const children = new Set([...items(layer.layers), ...items(layer.sublayers)]);
    await Promise.all([...children].map((child) => visit(child, path, entry.effectiveVisibility)));
  }
  await Promise.all([
    ...items(scene.layers).map((layer) => visit(layer, 'operational')),
    ...items(scene.ground?.layers).map((layer) => visit(layer, 'ground')),
    ...items(scene.basemap?.baseLayers).map((layer) => visit(layer, 'basemap')),
    ...items(scene.basemap?.referenceLayers).map((layer) => visit(layer, 'basemap reference')),
  ]);
  console.group('=== FLOOD SCENE ANALYSIS ===');
  console.log('WebScene:\n' + JSON.stringify(report.webScene, null, 2));
  console.table(report.layers.map(({ title, type, source, renderer, effectiveVisibility, loadStatus }) =>
    ({ title, type, source, renderer: renderer?.type, effectiveVisibility, loadStatus })));
  for (const [label, entries] of [['Flood water layer', report.waterLayers],
    ['Flow layer / potential hydrodynamic data source', report.flowLayers],
    ['Raster and elevation layers', report.rasterLayers.map(({ title, type, source, raster, elevation }) =>
      ({ title, type, source, raster, elevation }))]]) {
    console.group(label);
    for (const entry of entries) console.log(JSON.stringify(entry, null, 2));
    console.groupEnd();
  }
  if (report.errors.length) console.error('Layer loading errors:', JSON.stringify(report.errors));
  console.log('Snapshot: window.floodSceneAnalysis. No ArcGIS Online content was modified.');
  console.groupEnd();
  return report;
}
