// All identities of the current hydraulic scenario belong here.
export const pragueScenario = {
  id: 'prague-5160-v1',
  title: 'Prague · Q5160',
  webSceneItemId: '2067a314e0094fc5899a700d78f732cc',
  portalUrl: 'https://iprpraha.maps.arcgis.com',
  flow: {
    url: 'https://tiledimageservices5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/MagDir_5160_wgs/ImageServer',
    representation: 'vector-magdir', bandIds: [0, 1], flowRepresentation: 'flow-from',
    units: 'undocumented source units',
  },
  footprint: {
    url: 'https://services5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/ZC_5160/FeatureServer/0',
  },
  surface: {
    url: 'https://tiles.arcgis.com/tiles/SBTXIEUGWbqzUecw/arcgis/rest/services/teren_hladina5160/ImageServer',
    demResolution: 2, offsetMeters: 0.20,
  },
  // Fixed per-scenario metric frame. Never derive it from a camera or a tile.
  coordinates: { origin: [14.4125, 50.0815] },
  // Same activity normalization as Stage 3, shared by EVERY tile (not tile maxima).
  magnitudeReference: 33.0753930311,
  tiles: { scheme: 'geographic-512-v1', level: 0, sizeMeters: 512,
    velocitySize: 384, velocityBorder: 2, footprintSize: 768, footprintBorder: 2, meshCells: 192 },
  streaming: { concurrency: 2, maxRequired: 36, maxEntries: 96,
    maxBytes: 160 * 1024 * 1024, idleMs: 30000, preload: 1, debounceMs: 250 },
};
