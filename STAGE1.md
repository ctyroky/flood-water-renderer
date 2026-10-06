# Stage 1 — existing flood scene

Inspected 2026-10-05 using the installed ArcGIS Maps SDK for JavaScript 5.1.26.
Evidence comes from the saved WebScene JSON, public service metadata and the
loaded SDK layer/renderer objects. This stage contains no custom water renderer.

## Verification

- `npm run build` passes. Vite reports the SDK's large-chunk warning, with no build errors.
- Local Vite application tested in isolated headless Chrome at `http://127.0.0.1:5173/`.
- All seven layers loaded. All five operational layer views are visible, not
  suspended and finished updating; SceneView is ready with no fatal error.
- Saved camera position, heading, tilt and environment match the runtime view
  (heading/tilt differ only by floating-point rounding).
- Screenshots confirm the water surface and colored flow streamlines. A second
  frame was captured three seconds later to check delayed rendering errors.
- Final run: no browser console errors/warnings, failed requests or HTTP errors.
- Two-band raw-pixel access and a nonempty validity mask passed assertions.
- Local verification artifacts are in the git-ignored `.verification/` directory:
  `analysis.json`, `render-state.json`, `console.json`, `scene.png`,
  `scene-later.png`, and `build.log`. The temporary browser runner uses a separately
  cached Playwright package; project dependencies and the Vite setup are unchanged.

## Water surface

- **Zatopená oblast**, FeatureLayer, geometry `polygon`, `hasZ: false`, `hasM: false`.
- Source: [ZC_5160/FeatureServer/0](https://services5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/ZC_5160/FeatureServer/0).
- SimpleRenderer → PolygonSymbol3D → **WaterSymbol3DLayer**. The saved scene
  overrides the service's ordinary 2D fill symbol. Loading only the service would
  therefore fail to reproduce the water visualization.
- Saved water color: `[39, 103, 157, 191]` in ArcGIS JSON's 0–255 alpha convention.
  Runtime defaults: waterbody size `medium`, wave strength `moderate`, wave
  direction `null`. No per-location link to the flow raster is configured.
- No explicit elevationInfo; these non-Z polygons lie on the scene ground.
  The water is neither a mesh layer nor an imagery color surface.
- Fields include discharge/station names (`Q_Chuchle`, `Q_Vltava`, `Q_Berounka`,
  etc.), but they are not referenced by the flow renderer. They are not a local
  velocity-vector field.

## Flow source and renderer

- **Směr a rychlost toku**, **ImageryTileLayer**, runtime renderer type `flow`.
- Source: [MagDir_5160_wgs/ImageServer](https://tiledimageservices5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/MagDir_5160_wgs/ImageServer).
- Item ID: `1e03905bbac44b069a9d6d3fb5040212`.
- The service explicitly declares `esriImageServiceDataTypeVector-MagDir`;
  `serviceRasterInfo.dataType` is `vector-magdir`. This is **magnitude/direction,
  not U/V**. Source key properties confirm the band names:

| Zero-based band | Name | Service range | Meaning |
| --- | --- | --- | --- |
| 0 | Vector-Magnitude | 0 … 48.31741496161666 | Speed magnitude supplied to FlowRenderer |
| 1 | Vector-Direction | −90 … 269.99867374324106 | Direction supplied to FlowRenderer |

Storage is a tiled **LERC2D** raster, two **F64** bands, 256 × 256 tiles, WGS84
EPSG:4326. Native pixel spacing is approximately `0.0000129030273°` in each axis
(roughly 0.92 m east-west × 1.44 m north-south near Prague). The service has
eight LODs, 0–7. Band NoData is exposed as the localized string `1,79e+308`;
decoded PixelBlock masks are preferable to parsing this string.

Velocity units are **not declared** in service metadata, key properties or the
portal item description. Do not label values m/s or km/h without confirmation
from the data owner. Direction is used as angular data by the renderer, but the
upstream model's angle convention and conversion history are not documented.
The saved `flow-from` interpretation must not be silently changed to `flow-to`.
No upstream U/V raster, model mesh, solver output or derivation formula is exposed
by this scene. The immediate provenance is the two published raster bands.

| Runtime FlowRenderer setting | Value |
| --- | --- |
| flowRepresentation | `flow-from` (saved JSON: `flow_from`) |
| flowSpeed | 7.1 |
| density | 1 |
| trailLength | 1500 |
| maxPathLength | 200 |
| trailWidth | 3 points |
| trailCap | `butt` |
| base color | `[76, 100, 201, 255]` in saved JSON |
| color visual variable | `Magnitude`, stops at 0, 6, 12, 18, 24 |
| stop colors | `[57,0,179]`, `[113,77,191]`, `[158,107,144]`, `[207,146,112]`, `[235,182,152]` |
| layer interpolation | `bilinear` |
| saved display bandIds | `[0]` |
| elevationInfo | `null` (on the ground for this flow layer) |

`Magnitude` is a raster-derived renderer value, not a FeatureLayer field.
`flowSpeed` is an animation multiplier, not a measurement or a unit conversion.
The display `bandIds: [0]` does not mean the service is single-band. An explicit
`fetchPixels(extent, 128, 128, { bandIds: [0, 1], interpolation: 'nearest' })`
returned **two bands, a mask and 1,032 valid pixels** in the coarse diagnostic
request. Example magnitude/direction pairs: `(1.59934655, 16.84016488)` and
`(15.44817680, 12.19421614)`. These are overview samples, not native-resolution
validation of the physical model.

## Elevation, depth and other layers

The ground contains one **ElevationLayer**:
[teren_hladina5160/ImageServer](https://tiles.arcgis.com/tiles/SBTXIEUGWbqzUecw/arcgis/rest/services/teren_hladina5160/ImageServer),
item `0b5837e67d9741b09b0355c2db98c297`. It is a one-band F32 elevation cache,
LERC, EPSG:3857, with tile LERC error 0.1 and available LODs 11–20. The scene
declares gravity-related heights in meters and a saved vertical reference 5773.

This is the surface that positions the water polygons and flow. Its name suggests
a terrain/water-level composite; this interpretation is an **inference**, since
the service has no explanatory description. It is not identified as water depth.
There is no separate depth raster or original dry-terrain layer in this scene,
so water depth cannot be recovered simply from this elevation surface alone.

The other operational layers are SceneLayers for **Protipovodňová opatření**
(flood barriers, MeshSymbol3D/Fill), **Budovy** (buildings) and **Mosty** (bridges).
The basemap is **zakladni_mapa_cernobila_WGS**, a VectorTileLayer. There are five
operational layers, one ground layer and one basemap layer. The current scene has
no groups, but the inspector recursively supports nested layer/sublayer trees.

## JavaScript access and Stage 2 recommendation

Public APIs expose renderer configuration, raster metadata/statistics/key
properties, spatial references, extents and pixel size. `ImageryTileLayer.fetchPixels`
provides decoded numeric band arrays and masks; this was verified in the browser.
`identify` is also available for point queries. FeatureLayer queries can retrieve
water polygon geometry; ElevationLayer/Ground elevation queries can sample height.
The pixel probe does not prove bulk export is allowed: the source is tiles-only,
`allowCopy: false`, `exportTilesAllowed: false`, `allowRasterFunction: false`.
It exposes no multidimensional/time series (`hasMultidimensions: false`).

For Stage 2, use bounded native-resolution **fetchPixels requests for bands
`[0, 1]`**, with masks and extent/georeferencing retained. First confirm velocity
units and angle/from-to convention with the data owner and known river directions.
Convert magnitude/direction into a consistent local east/north velocity field;
interpolate vector components rather than wrapped angles. Then upload a suitable
float texture plus validity mask to the future GPU renderer. Do not extract
colors or depend on private FlowRenderer GPU resources.

Issues to resolve before a physically meaningful shader:

- EPSG:4326 raster versus EPSG:3857 scene, latitude-dependent metric scale,
  local GPU coordinates and vector orientation during reprojection.
- Direction wraparound and from/to interpretation; scalar bilinear interpolation
  of angles can create incorrect directions near the wrap boundary.
- NoData/wet-dry boundaries, tile seams and overview resampling. The full raster
  has about 4.66 GB uncompressed data, so fetch only the needed extent/resolution.
- F64 source values versus usual F32 GPU textures, and large world coordinates.
- No documented velocity units, original U/V lineage, depth grid or time axis.
- Ground may already include flood level. Keep water/terrain alignment and
  vertical datum consistent; do not interpret elevation directly as depth.
- Existing WaterSymbol3DLayer waves are configured independently of FlowRenderer.

References: [FlowRenderer](https://developers.arcgis.com/javascript/latest/references/core/renderers/FlowRenderer/),
[TiledImagery / fetchPixels](https://developers.arcgis.com/javascript/latest/references/core/layers/mixins/TiledImagery/#fetchPixels),
[saved WebScene](https://iprpraha.maps.arcgis.com/home/webscene/viewer.html?webscene=2067a314e0094fc5899a700d78f732cc).
