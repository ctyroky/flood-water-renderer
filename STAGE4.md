# Stage 4A — reusable tiled water streaming

Implemented and verified in Chrome on 2026-10-06. Stages 1–3 supply the established
source interpretation and water appearance; this stage changes acquisition,
partitioning and lifetime management, not the hydraulic conversion or advection.

## Acceptance answers

**Can the user navigate through the available flood scene while custom flow-driven
water streams automatically according to the camera?** Yes, at working/detail
views. Verified around Střelecký ostrov/Most Legií, Vyšehrad, Holešovice and Chuchle.
The fixed-resolution implementation deliberately caps a selection at 36 tiles.
A very wide overview or horizon view can exceed that budget: it shows a “zoom
closer for full coverage” notice, and prioritizes the area around the screen center.
It does not promise simultaneous full-city coverage at arbitrary zoom. No LOD.

**Are tile boundaries visually detectable in the animated water surface?** No
significant interior seams were observed in the tested central, northern and
southern views. Direct GLSL comparisons at shared boundaries were identical at
896 samples/times. This is evidence for tested areas, not a guarantee for every
shoreline: a few antialiased polygon-edge pixels differ, and inherited ground
approximation/shoreline fringes remain possible.

**Could another compatible ArcGIS hydraulic scenario be connected primarily by
changing scenario/data-source configuration rather than modifying the renderer?**
Yes. Explicit source roles, geographic frame, activity reference and acquisition
settings reside in scenario configuration. The current adapter supports masked
WGS84 Vector-MagDir/flow-from, polygon coverage and one active Ground elevation
source. Other encodings/conventions need an adapter conversion, not shader edits.
A second hydraulic dataset was not fabricated or tested.

**Does Stage 4A require pre-generated custom water tiles?** No. All tiles are
runtime RAM/GPU resources built from public ArcGIS service APIs. There is no custom
persistent tile format, offline cache or preprocessing backend.

## Architecture and source configuration

```text
src/scenarios/prague.js
    WebScene, explicit source roles, fixed grid and residency settings
        ↓
src/data/ArcGISFloodAdapter.js
    getWaterFootprint / getVelocityTile / getSurfaceElevation / loadTile
        ↓ normalized tile contract
src/water/TileGrid.js + cameraTiles.js + TileManager.js
    selection, queue, cancellation, retry, RAM/GPU residency
        ↓
src/render/TiledWaterRenderNode.js + shaders/
    static tile buffers/textures, shared water program, global clock and uniforms
```

`src/main.js` creates the configured WebScene/SceneView and owns scenario lifetime.
The saved camera, layers, environment and ground remain WebScene supplied.
`startWater.js` connects controls, adapter, tile manager and renderer. Runtime
visibility changes are local; no ArcGIS content is modified.

Source roles resolve by explicit service URL, or an optional `layerId` matching
`Layer.id` in the WebScene (not a numeric FeatureServer sublayer number). Titles
are not used as semantic discovery heuristics. Feature-layer URLs normalize their
numeric sublayer suffix. The adapter checks layer types, raster representation,
flow renderer convention, geographic source SR, polygon geometry and ground role.
Grid validation rejects invalid dimensions and meshes exceeding Uint16 indexing.

The application-source search

```sh
rg -n '2067a314|MagDir_5160|ZC_5160|teren_hladina5160|SBTXIEUGWbqzUecw' src
```

returns only `src/scenarios/prague.js`: WebScene ID line 5, flow URL line 8,
footprint URL line 13 and elevation URL line 16. No matches in renderer/shaders,
tile manager or generic grid. Historical reports, screenshots' evidence metadata
and local verification scripts naturally mention the current scenario.

## Renderer data contract

Each nonempty runtime tile has:

- Stable scenario/scheme/level/x/y ID; logical geographic extent; global metric
  `worldOffset` and `sizeMeters`.
- `field`: Float32 RGBA pixels, width/height, fetched geographic extent and logical
  → fetched UV transform. R=east, G=north, B=original magnitude, A=validity (0/1).
  Invalid RGBA is zero. Texture rows run north to south. No angular data in GLSL.
- `waterFootprint`: independent Uint8 coverage, dimensions, padded extent and UV
  transform. Water coverage is not inferred from velocity validity.
- `surface`: Float32 XYZ/UV vertices relative to a tile render-coordinate origin,
  Uint16 indices; static geometry from the configured vertical surface. Shared
  scenario east/north/up orientation is passed separately to the renderer.
- Byte accounting and acquisition metadata. Empty tiles have `empty: true` and
  zero retained data bytes; they receive no water GPU resources.

`src/data/contract.js` validates texture dimensions/types/transforms and geometry
array types. ArcGIS PixelBlock masks, georeferencing, band representation and
missing elevation checks belong to the adapter. A null raster PixelBlock is
all-invalid flow; usable water geometry can still render calmly there.

Current conversion remains `east = M sin(D)`, `north = M cos(D)`, with published
D in degrees. This reproduces established ArcGIS flow-from behavior, not an
independent physical validation. Source velocity units remain undocumented.
All interpolation operates on components. Nearest-cell validity and normalized
valid-neighbor interpolation retain the Stage 2/3 sampling behavior.

## Fixed tile scheme and overlap

Origin: longitude 14.4125°, latitude 50.0815° (shared with the former test frame).
Use R=6378137 m, north meters/degree=Rπ/180, east meters/degree additionally scaled
by cos(origin latitude). Logical tiles are 512 × 512 m in this fixed frame:
approximately 0.0071675137471° longitude × 0.0045993742547° latitude. Indices use
floor relative to that fixed origin, including negative indices. Camera position
never changes grid alignment. A `level` is part of the key, but only level 0 exists.

| Resource | Logical resolution | Padded/storage size | Rationale |
|---|---:|---:|---|
| Velocity | 384 × 384; 1.333 m/frame pixel | 388 × 388 RGBA32F | Near source detail, bounded fetch and upload |
| Polygon mask | 768 × 768; 0.667 m/frame pixel | 772 × 772 R8 | Finer bank coverage |
| Elevation mesh | 192 × 192 cells; 2.667 m | 193² vertices, 73,728 triangles | Comparable to Stage 3; Uint16 indices |

Each texture requests a **two-pixel border on every side**: 2.667 m for velocity,
1.333 m for footprint. Rendering covers only the logical tile. For a logical UV
in [0,1], fetched UV is `(border + logicalUV * logicalCount) / paddedCount`.
North-first raster rows require the established V flip. Adjacent textures share
four columns/rows; they use equal resolution and matching sample centers.

`fetchPixels` uses configured bands [0,1] and nearest source resampling. Its
returned extent/dimensions are checked. No wrapped direction interpolation.
The service/SDK may internally fetch its own source tiles; application requests
are always bounded, never the complete velocity raster.

Footprint acquisition first queries intersecting IDs in the padded tile area,
then features in batches of 32. Geometry is WGS84, generalized by ≤0.000002°,
rasterized with even-odd holes into a clipped canvas. Fully empty masks skip both
velocity and elevation work. A service can return the full geometry of an
intersecting feature; a spatial filter does not guarantee server-side clipping.
No whole-flood custom mesh or velocity raster is constructed.

Ground.queryElevation uses 2 m DEM sampling and the existing +0.20 m tolerance.
Boundary vertices derive from identical global integer mesh indices, then
`webgl.toRenderCoordinates` handles ArcGIS render space. Missing elevation under
water is a tile error rather than invented hydraulic depth. This source is a
terrain/water-level composite hypothesis; its elevations are never treated as depth.

The fixed east/north metric approximation and shared tangent basis are appropriate
for this Prague reach, not a global projection. East-scale error grows away from
the origin (roughly 0.2% per 0.1° latitude here). A geographically much larger
scenario should supply a more rigorous adapter/frame transform.

## Selection, asynchronous lifecycle and cache

SceneView `visibleArea.extent` (fallback `view.extent`) determines a geographic
bounding box, clipped to source coverage. A one-tile preload ring surrounds it.
Selection uses the viewport center to prioritize visible tiles, followed by
preload. Bounding-box selection conservatively overfetches at oblique views;
finite enumeration and the 36-tile limit prevent horizon/full-scene requests.

Camera/size/stationary changes are coalesced at 250 ms. Identical tile membership
and visibility do not requeue requests. Existing required tiles remain resident.

States: unloaded → loading → ready, or error. At most two tile preparations run
concurrently. A footprint precedes parallel velocity/elevation preparation.
Duplicate requests are prevented by record state. AbortSignals cancel obsolete
work; generation/lifetime checks ignore late results. A failed sibling operation
aborts the other operation for that tile. Errors retry at increasing delays,
up to three attempts, without stopping other tiles. Fatal renderer errors restore
original scene water and display a clear error.

Cache keys include scenario identity, scheme and level. LRU eviction only removes
unused records. Limits: 96 records and **160 MiB retained array bytes**, with a
30-second idle timeout checked every two seconds. Required tiles are retained;
new data that cannot fit reports a budget error. GPU deletion occurs in the
renderer; loading cancellation and CPU record release occur in the manager.

A water tile retains **4,192,036 bytes (3.998 MiB)** of arrays: velocity, mask,
vertices and indices. GPU storage has approximately the same payload, so a full
160 MiB cache can mean about 320 MiB combined CPU+GPU, excluding ArcGIS resources,
texture/buffer overhead, response data and transient preparation arrays.
New ready tiles upload at most one per render frame; each resident tile uploads
once. Steady animation has no raster requests, mesh rebuilds or texture uploads.
A 450 ms alpha fade uses readiness time. Already preloaded tiles are fully visible
when entered, without sliding geometry.

## Global water and visual controls

The shader uses `p = tile.worldOffset + logicalUV * tile.sizeMeters`.
Offsets are exact multiples of 512; shared boundaries have the same procedural
coordinates. Every tile has one shared time, periods, seeds, visual settings,
light frame and **scenario-wide magnitude reference** (33.0753930311 here).
No per-tile maximum normalizes water activity. Thus tiles partition data/geometry,
not the animated surface. Stage 3 dual-phase flow-map advection, noise gradients,
lighting, Fresnel, specular and NoData calm-water fallback are preserved.

Water color is a uniform-only [0,1] piecewise interpolation, centrally configured
in `water/parameters.js`: 0 → blue-green [.12,.29,.35], .45 → original river color
[.25,.34,.30], 1 → muddy brown [.38,.28,.16]. Default .45 preserves Stage 3.
It supplies the body/base color before lighting, not a final RGB overlay.
Brightness, reflection, flow-speed multiplier, pause and comparison modes work
across every tile. The blue-to-brown slider track indicates the color range.

Original Esri water is hidden locally in custom mode across the scene; only loaded
custom tiles are visible. Esri comparison mode restores the original water.
This means an unrequested or pending region is not filled with a different water
renderer while custom tiles load.

## Verification and measurements

Production Vite build succeeds; only the existing large ArcGIS bundle warning.
Four Node tests cover grid/border coordinates, scenario keys, color endpoints,
duplicate suppression, reuse, eviction, cancellation and isolated bounded retry.
These use resource-lifecycle stubs, not a fabricated hydraulic dataset.

Chrome verification used real services and a 1440 × 1000 viewport. No persistent
console/page/HTTP errors or warnings were recorded. No remote mutation requests
were observed. Actual comparisons included north-up, oblique/reversed heading,
bridge/building occlusion and Esri/FlowRenderer reference modes.

| View | Required tiles incl. preload | Active water draws | Cached GPU MiB |
|---|---:|---:|---:|
| Střelecký ostrov / Most Legií | 24 | 5 | 40.0 |
| Nearby / return from cache | 20 / 16 | 6 / 4 | 52.0 |
| Bridge oblique | 25 | 7 | 60.0 |
| Vyšehrad | 20 | 4 | 92.0 |
| Holešovice | 20 | 3 | 139.9 |
| Chuchle | 25 | 6 | 159.9 |
| Chuchle after idle eviction | 25 | 6 | 56.0 |

Typically 3–7 nonempty visible draws and 16–25 required tiles in these views.
Across 49 velocity tiles: mean velocity preparation **503 ms**, mean elevation
plus mesh preparation **315 ms**. Restart with warm service/browser caches measured
236 ms and 234 ms respectively. Timings are machine/network/cache dependent.
CPU submission averages (including one-time uploads and audit) were about 2.5–10.3
ms per custom render invocation. This is not a GPU timer or an FPS guarantee.

Returning from the nearby view reused cached tiles: velocity requests remained 13,
cache hits rose from 16 to 32. Maximum observed cache payload was 159.91 MiB.
After 32 seconds at Chuchle, 80 old/unused records had been evicted and only its
25 required records remained. Every retained tile had at most one upload.
Rapid camera changes cancelled four obsolete preparations with zero tile errors.
Restarting the actual same configured scenario during navigation cleared the old
record map and reduced its GPU payload to zero; the new scene streamed normally.

### Seam and deterministic-animation evidence

- 13 adjacent central tile pairs: all shared velocity values and masks were
  **bitwise identical**. Maximum reconstructed shared mesh position difference
  **0.0000216 m**, from Float32 representation.
- Polygon coverage masks had sparse antialias differences: maximum 55/255 at one
  tested pair, at most 18 differing byte samples per comparison. These are bank
  rasterization tolerances, not an interior missing-water strip. No visible crack
  was observed; pixel-identical shoreline coverage is not claimed.
- The actual water fragment shader was rendered into a one-pixel RGBA8 target
  using each neighbor's real textures, global offsets and logical boundary UVs.
  **896 comparisons** at times .65, .75, 4.799 and 4.801 seconds had **zero RGBA
  difference** across the boundary. 377 sampled results changed over time;
  calm/NoData regions correctly remained stationary. This tests both field
  sampling and global procedural phase at the edge, not merely CPU bookkeeping.
- Same-camera screenshots at .65/.75 s, 4× flow, had mean absolute RGB change
  1.076/255 in the central water crop. Around a phase reset (4.799/4.801 s), change
  was 0.045/255; only 0.004% of crop pixels changed by more than 2 levels. No
  reset flash was seen. This is a continuity check, not physical velocity validation.
- Color endpoints and stronger speed/brightness/reflection were checked while
  paused. Uniform values changed; velocity request and upload counts did not.
  Local flow direction/speed structure remained the established Stage 3 field,
  including bending near the island and calmer margins. No global average vector
  was introduced.

Evidence: [verification measurements](docs/stage4/verification.json),
[central boundary view](docs/stage4/central-seams.png),
[oblique bridge](docs/stage4/bridge-oblique.png),
[Holešovice](docs/stage4/holesovice.png), [Chuchle](docs/stage4/chuchle.png),
[blue](docs/stage4/color-blue.png), [brown](docs/stage4/color-brown.png),
[FlowRenderer comparison](docs/stage4/flow-reference.png).

## Adding a future scenario

1. Run the hydraulic model and publish standard ArcGIS flow, flooded polygons
   and vertical surface; create/update its WebScene.
2. Add a scenario object with a stable scenario/revision ID, portal/WebScene ID,
   explicit flow/footprint/surface identities, representation/convention metadata,
   geographic origin and suitable grid/acquisition settings. Do not scatter IDs
   through the renderer. Adjust the scenario-wide magnitude activity reference.
3. Use the current adapter for compatible Vector-MagDir data. For different source
   semantics, implement normalization at the adapter boundary to the same tile
   contract. No raster semantics go into GLSL.
4. Select the configuration in main, or call `floodApp.loadScenario(config)` in dev.
   The old lifetime aborts requests, disposes GPU resources, clears records and
   destroys its SceneView; the new one resolves/validates sources and begins
   streaming according to its camera. Shared visual parameters survive.
5. Inspect contract diagnostics and confirm physical convention/source units for
   that scenario. Shader, water appearance and generic residency policy remain
   reusable. A future WebScene-metadata role resolver can replace explicit config
   without changing the renderer; name-only heuristics are not implemented.

No renderer-specific persistent preprocessing is normally needed. A different
backend could later implement the adapter contract if measurements justify it.

## Remaining limitations / stopping point

One resolution and bounded coverage at overview scale; source-service latency and
repeated polygon geometry downloads; small shoreline/elevation approximation
fringes; unknown physical velocity units; shared tangent-frame approximation;
inherited procedural/highlight appearance can look banded under strong settings.
The original water is hidden while custom tiles are pending, so fast long jumps
can reveal loading gaps before requests finish. Preload/fade help but do not
remove latency. Context restoration can require GPU reuploads, as expected.

No LOD, generated/offline tiles, foam, depth effects, dynamic geometry, SSR,
actual-building/environment reflections, refraction, wakes, spray, obstacle
interaction or hydraulic time series were implemented. Stage 4B is not started.

API references: [SceneView visibleArea](https://developers.arcgis.com/javascript/latest/references/core/views/SceneView/),
[ImageryTileLayer fetchPixels](https://developers.arcgis.com/javascript/latest/references/core/layers/ImageryTileLayer/),
[Ground queryElevation](https://developers.arcgis.com/javascript/latest/references/core/Ground/),
[RenderNode](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/RenderNode/).
