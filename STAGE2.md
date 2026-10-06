# Stage 2 — GPU velocity field proof of concept

Implemented against installed `@arcgis/core` **5.1.26**. No ArcGIS Online item is
modified. Stage 1 is retained in `STAGE1.md`; its full-extent inspection is no
longer executed at application startup. No realistic water, foam, reflection or
Fresnel work is included.

## Result and architecture

The complete path is implemented:

`ImageryTileLayer.fetchPixels → masked magnitude/direction → east/north components
→ RGBA32F texture → RenderNode GLSL sampler → geographically positioned animation`.

The custom shader samples the field at every rendered surface fragment. A weak
magnitude tint uses that sample directly. A 24 m grid of arrows samples the same
texture at each cell center; white beads move along those arrows at different
speeds. Beads reset after traversing 16 m. They are local velocity indicators,
not persistent particles or a fluid simulation. The source water layer remains.

Implementation:

- `src/velocity/field.js`: bounded public raster fetch, conversion and statistics.
- `src/velocity/surface.js`: static elevation mesh and render-coordinate conversion.
- `src/render/FloodVelocityRenderNode.js`: owned WebGL resources, integration,
  animation and one-time GPU readback audit.
- `src/render/shaders/field.glsl`: shared validity-aware component interpolation.
- `src/render/shaders/velocity.{vert,frag}.glsl`: surface and diagnostic display.
- `src/velocity/startVelocity.js`: source selection and small comparison control.

## Bounded area and raster measurements

The Vltava around **Střelecký ostrov and Most Legií** provides faster main channels,
slower island margins and direction changes. The area overlaps the saved camera.
It also includes invalid raster cells, allowing NoData behavior to be tested.

| Property | Value |
| --- | --- |
| Requested and returned extent, EPSG:4326 | xmin **14.4085**, ymin **50.078**, xmax **14.4165**, ymax **50.085** |
| Approximate metric coverage | **571.467 × 779.236 m** |
| Requested and returned dimensions | **384 × 512** |
| Pixel spacing, longitude/latitude | **0.0000208333333° × 0.000013671875°** |
| Approximate east/north pixel spacing | **1.4882 × 1.5219 m** |
| Valid pixels | **117,836 / 196,608 (59.93449%)** |
| Magnitude min / max / mean, valid pixels | **0 / 33.07539303 / 16.81973601** |
| Published direction range | **−88.30701113° … 269.11837843°** |

Source: the existing **Směr a rychlost toku** ImageryTileLayer,
[MagDir_5160_wgs/ImageServer](https://tiledimageservices5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/MagDir_5160_wgs/ImageServer).
The request explicitly uses `{ bandIds: [0, 1], interpolation: 'nearest' }`.
Nearest-neighbor fetching prevents interpolation of raw wrapped angles before
conversion. Returned extent, dimensions and pixel spacing are retained. This is
a bounded resampling near the source resolution, not an assertion that every
output sample is a distinct native raster pixel.

Validity is the intersection of the PixelBlock mask and any available per-band
masks. Invalid values are never converted. Non-finite or negative magnitudes are
also rejected. No localized numeric NoData sentinel is parsed. An unmasked
response is rejected explicitly rather than assuming every value is valid.

## Direction convention and velocity

Three meanings are deliberately separated:

1. **Published value:** band 1 is `Vector-Direction`; the upstream model's physical
   convention, units for speed and conversion history remain undocumented.
2. **SDK interpretation:** in the installed SDK's FlowRenderer path, a MagDir
   angle produces raster coordinates proportional to
   `(cos(angle − π/2), sin(angle − π/2))`. Raster Y increases southward. For
   **`flow-from`**, the SDK's flow simulation uses a positive scale; `flow-to`
   reverses it. This was checked by reading installed SDK source for interpretation
   only (`views/support/flow/dataUtils.js` and `utils.js`). The application does
   not import those internal modules or access any FlowRenderer GPU resources.
3. **Prototype:** use local east/north components
   `vx = M sin(D π/180)`, `vy = M cos(D π/180)`.
   Thus 0° → north, 90° → east, 180° → south, 270° → west.

In particular, **do not add a conventional meteorological 180° reversal merely
because the property is named `flow-from`**. The formula targets the displayed
SDK behavior. It is not independent validation of the hydraulic model.
The application fails explicitly if the expected vector-magdir / flow-from
configuration is changed.

No magnitude normalization occurs during conversion. B retains the original
magnitude. Displayed bead speed is `0.45 × length(interpolated velocity)` diagnostic
meters per animation second. This is an arbitrary visualization scale, **not an
m/s conversion**. Color is normalized by the fetched maximum only. Motion pauses
with the checkbox; frame deltas are capped at 0.1 s to avoid jumps after stalls.

## Coordinates, elevation and texture mapping

The raster is EPSG:4326 and the scene's public spatial reference is EPSG:3857.
The global SceneView's **internal render coordinates are spherical ECEF**, not
Web Mercator. Mesh vertices are transformed using the public
`webgl.toRenderCoordinates()` API, so the shader never mistakes EPSG:3857
coordinates for rendering coordinates.

Metric diagnostic coordinates use a local spherical east/north approximation:

```text
east  = R cos(latitude0) (longitude − longitude0) in radians
north = R (latitude − latitude0) in radians
R = 6378137 m; center = (14.4125°, 50.0815°)
```

East/west and north/south degree scales are distinct. Across the 0.007° latitude
span, variation in the east scale from its center value is about **0.0073%**.
This is sufficient for the bounded diagnostic. It does not establish geodetic
accuracy or vector basis correctness for a large area. `localMetricSize()` and
`toVelocity()` isolate these choices for replacement later.

A **48 × 64 cell** elevation mesh has **3,185 vertices / 6,144 triangles**.
`Ground.queryElevation` requests 4 m DEM resolution once, using the scene's own
ground. A **2 m diagnostic lift** avoids z fighting with the water. ECEF vertex
coordinates are calculated in F64, a local F32-representable origin is subtracted,
and the camera matrix translation is calculated in double precision before
upload. This avoids passing million-meter coordinates into F32 vertex arithmetic.
The ground mesh is an approximation, especially near sharp terrain changes.

The texture is **384 × 512 RGBA32F**, uploaded from a Float32Array:

| Channel | Contents |
| --- | --- |
| R | east velocity component |
| G | north velocity component |
| B | original magnitude |
| A | 1 valid / 0 invalid |

Invalid texels are `(0,0,0,0)`. Storage is **3,145,728 bytes (3 MiB)**. Raster rows
remain north-to-south, and `UNPACK_FLIP_Y_WEBGL` is false. Surface UV is
`u=(lon−xmin)/(xmax−xmin)`, `v=(lat−ymin)/(ymax−ymin)`; the sampler flips V once:

```text
texel coordinate = (u, 1−v) × (width, height) − 0.5
pixel center lon = xmin + (column + 0.5) × pixelWidth
pixel center lat = ymax − (row + 0.5) × pixelHeight
```

Filtering is manual bilinear `texelFetch` of **components**, with nearest texture
filtering and clamp-to-edge. No float-linear extension is needed. The nearest
raster cell must be valid; remaining interpolation weights are renormalized over
valid neighbors. Out-of-extent and dry samples return zero validity. Dry fragments
are discarded. No angles are interpolated, and dry cells are not made wet by a
neighbor. Opposing vectors can reduce the interpolated speed; B remains a
separately interpolated scalar magnitude.

## RenderNode integration and performance

The node uses the current `RenderNode.createSubclass` API and consumes/produces
`composite-color`. It binds the existing managed target, draws only to color0,
does not clear ArcGIS buffers, and preserves depth and other attachments. Depth
testing remains enabled; depth writes are disabled. Existing buildings and bridges
occlude the overlay. Alpha blending lets the original water and FlowRenderer remain
visible. WebGL state is reset around the custom pass.

The field texture and geometry buffers upload once. Normal rendering is one indexed
draw call plus a few uniforms; there are no per-frame raster requests, texture
uploads, particle arrays or geometry rebuilds. `requestRender()` drives animation
and stops when the custom overlay is hidden or paused. GL resources are deleted
on node destruction; context-invalid resources can be recreated from retained CPU
data. Full browser context-loss recovery was not tested.

The initial Chrome run measured about **2.32 s** for bounded fetch plus conversion,
including network time. **888 rendered frames used one texture upload**. The
accumulated CPU submission timer was about **10.08 s** (roughly 11.35 ms/frame,
including initial compilation/readback and affected by headless capture overhead).
This is an observation, not a GPU timing or production frame-rate benchmark.
The conservative GL state resets and one-time audit prioritize correctness in
this proof of concept. The audit synchronizes GPU/CPU once and never per frame.
Original ArcGIS layers still have their own rendering/network costs.

## Verification and comparison

- Vite production build passes; only the existing large-SDK-chunk warning remains.
- Chrome shows the saved scene with both water and flow, plus the custom overlay.
  Comparison modes `FlowRenderer`, `GPU field`, and `Both` work.
- No console, HTTP, request or fatal SceneView errors in the final integration run.
- A one-time transform-feedback audit executes the **same GLSL `fieldAt`** function
  against the actual uploaded texture. Five wet pixel centers match their F32 CPU
  values; dry and out-of-extent samples have validity zero. Two arbitrary subpixel
  positions are checked independently against CPU interpolation. Maximum error
  across the audit was **7.404 × 10⁻⁶**.
- Example arbitrary wet sample at surface UV `(0.51731, 0.43327)` returned
  approximately `(-0.198364, 9.224718, 9.229107, 1)` from the GPU.
- Deterministic shader-time screenshots at 0, 0.4 and 0.8 seconds independently
  verify visible motion. Of 207 tracked bead centroids, 206 have direction cosine
  above 0.95 against the projected CPU vector (median 0.999964). One image-tracking
  outlier remains; this is not a claim of exact per-pixel tracking. Over 0.8 s,
  example magnitudes 8.49, 18.48 and 30.79 move approximately 5.25, 11.19 and
  18.07 screen pixels respectively. Slow/reversed margin vectors also move in
  their local directions. Evidence: `gpu-motion-measurements.json`.
- Oblique and north-up images show geographic alignment: arrows follow the main
  channels and change direction around the island margins. Warmer/faster cells
  occupy the same channels as the reference's high-magnitude trails; cooler/slower
  cells occur along the island and banks. Bridge geometry correctly covers the
  diagnostic overlay. Fine-scale paths are not expected to match pixel-for-pixel:
  the existing FlowRenderer smooths/resamples and integrates streamlines, whereas
  these arrows sample local components on a 24 m grid.
- Reference frame sequences support the signed direction: north-up image tracking
  finds northward channel motion and northeastward island-margin motion, matching
  the prototype. An isolated comparison also temporarily reduced the reference
  renderer's local `flowSpeed` from 7.1 to 0.5; island-margin displacement was
  (+1, -3) screen pixels with correlation 0.886. The application's renderer remains
  unchanged. Repeated long trails, fade-in and frame timing make whole-image
  tracking ambiguous, so this is a qualitative agreement check, not a quantitative
  match of absolute speed or every streamline. Relative fast/slow regions agree;
  precise reference speed ratios have not been established.
- The additional slowed-reference capture logged one tile `AbortError` while
  changing camera/renderer; subsequent frames rendered successfully. The original
  integration run and the additional original-speed capture had no errors. This
  cancellation did not indicate a failed raster fetch or custom GPU pass.

Local evidence is in git-ignored `.verification/`: `stage2-analysis.json`,
`stage2-final.json`, `stage2-console.json`, `stage2-comparison.json`,
`stage2-both.png`, comparison screenshots and deterministic GPU-time frames.

## Limits and stopping point

The GPU data-access statement is proven for this bounded, resampled area, at the
precision/resolution described above:

> A custom ArcGIS RenderNode shader can obtain and use the local hydrodynamic
> velocity at an arbitrary rendered position within the test area.

This means sampling the published field at any UV-covered surface position, with
an explicit invalid result for NoData. It does not prove the source's physical
units or model accuracy, arbitrary 3D water-column velocities, time-dependent
hydrodynamics, or a large-area production renderer. The scalar original magnitude
and direction provenance remain those documented in Stage 1. The RenderNode API
is still described by Esri as experimental; no obsolete `externalRenderers` API is
used. The original WaterSymbol3DLayer has not been replaced. **Stage 3 is not started.**

API references: [RenderNode](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/RenderNode/),
[render coordinate transforms](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/),
[fetchPixels](https://developers.arcgis.com/javascript/latest/references/core/layers/mixins/TiledImagery/#fetchPixels),
[FlowRenderer](https://developers.arcgis.com/javascript/latest/references/core/renderers/FlowRenderer/).
