# Stage 3 — first flow-driven water surface

## Stage 3.1 — interactive tuning extension

The existing panel now includes **Flow speed** (0.25–5×), **Brightness** (0.5–2)
and **Reflection** (0–2), all defaulting to 1. Numeric readouts update on each input
event. Flow speed multiplies the unchanged 0.12 baseline; brightness scales the
complete shaded water, including highlights. Reflection multiplies both existing
Fresnel/sky and specular strengths. A smooth highlight shoulder above RGB 0.8
avoids hard white clipping; sky blending is capped at 0.95.

Changes update parameters/uniforms and request a render, including while paused.
No node, mesh, texture or field is recreated. The paused surface can change its
static phase distortion when speed changes; actual motion resumes with the clock.
There is no change to spatial velocity sampling, phase periods or advection logic.

Vite build passes. Chrome checks cover the four requested combinations, matte
reflection=0, reflection=2 and slider endpoints, keyboard input, pause/resume,
actual uniform values and resource identity. Both textures remain uploaded once.
At the same camera/time, default settings differ from the saved Stage 3 water by
only **0.002 mean RGB levels on a 0–255 scale**. Brighter settings retain surface
contrast; even the maximum test produces no white water pixels in the evaluated view.

Deterministic 0.1 s water-frame comparisons retain the local hydraulic directions:
median direction cosine **0.995 / 0.998 / 0.999** at **1× / 2.5× / 4×**, with median
tracked displacement **0.41 / 0.95 / 1.61 px**. These are image-tracking observations,
not physical speed calibration. At high multipliers the unchanged flow-map method
can show more stretching within a cycle. Stage 4 is not included.

Local evidence: `.verification/verify-stage31.mjs`, `stage31-results.json`,
`stage31-visual-measurements.json`, `stage31-motion-measurements.json`, and screenshots.
Normal ArcGIS tile cancellations during camera changes are logged separately from
rendering/network failures.

---

Implemented and evaluated in Chrome against `@arcgis/core` **5.1.26**. The bounded
Stage 2 area is unchanged: EPSG:4326 **[14.4085, 50.078, 14.4165, 50.085]**, about
571 × 779 m around Střelecký ostrov / Most Legií. ArcGIS Online remains read-only.

## Result

**Yes: the custom water surface communicates spatially varying hydrodynamic flow
without arrows, particles or FlowRenderer trails.** Moving features are the shaded
procedural normals of the surface. Broad channel motion and changes of direction
near the island are visible; slow margins are calmer. This is a first plausible
river surface, not a photorealistic or physically validated hydraulic simulation.
Very slow motions are harder to perceive at overview distance. Motion is clearer
in closer views and toward the light.

- [Custom water, oblique view toward the light](docs/stage3/custom-water.png)
- [Original Esri water, north-up comparison](docs/stage3/esri-water.png)
- [Six-second animation, actual Chrome frames](docs/stage3/water-motion.webp)

The WebP contains 75 deterministic frames spaced by 0.08 shader seconds, played
once. It demonstrates rendered appearance and motion, not hardware FPS.

## Preserved pipeline and integration

Raster fetching, magnitude/direction conversion, source validity, the **384 × 512
RGBA32F** velocity texture, geographic mapping, `fieldAt()` sampler and original
one-time GPU audit are unchanged. R/G remain east/north components, B original
magnitude, A validity. No private FlowRenderer resources are accessed.

The existing RenderNode compiles the water fragment shader alongside the retained
diagnostic shader. Both share the vertex transform and velocity texture. Normal
water mode contains no arrows, dots or speed color ramp.

| Mode | Custom pass | Original water | FlowRenderer |
| --- | --- | --- | --- |
| Custom water | Water | Hidden | Hidden |
| Esri water | Off | Visible | Hidden |
| Custom water + FlowRenderer | Water | Hidden | Visible |
| Velocity debug, development only | Stage 2 diagnostic | Visible | Hidden |

Visibility changes are local and restored on disposal. A custom rendering failure
restores the original layers and displays an error. The original water layer is
hidden as a whole in custom mode, including outside the rectangle: the POC has an
intentional straight boundary, not an inferred shoreline. No full-area rendering
or streaming was added.

## Local advection, phases and normal structure

`src/render/shaders/water.frag.glsl` samples the spatial velocity texture at every
fragment's geographic UV, working in Stage 2's local metric east/north coordinates.
For each of two scales:

```text
phaseA = fract(time / period)
phaseB = fract(time / period + 0.5)
weightA = sin(pi * phaseA)^2
coordinateA = (position - localVelocity * speedScale * period * phaseA) / spatialScale
coordinateB = (position - localVelocity * speedScale * period * phaseB) / spatialScale
slope = weightA * slopeAt(coordinateA) + (1 - weightA) * slopeAt(coordinateB)
```

Displacements are bounded to one cycle. A resetting phase has **zero weight and
zero weight derivative** while the other phase is fully visible. Large/fine phases
have different periods and seeds; fine detail travels at **1.13×** the base rate.
There is no global average vector or unbounded displacement by total elapsed time.

The Stage 2 conversion remains `east = M sin(D)`, `north = M cos(D)`. Speed scale
is **0.12 diagnostic meters per second per source unit**, not a source-unit-to-m/s
calibration. Different magnitudes produce different speeds without modifying data.
This is flow-map distortion, not integrated material trajectories or conservation
of fluid mass. Strong velocity gradients can shear detail within each cycle.

Procedural **gradient noise with analytic spatial derivatives** uses hash-derived
gradients and quintic interpolation; no external textures/dependencies are needed.
A three-tap convolution along the local current elongates world-anchored structure,
and the slope along the current is reduced slightly. This avoids the phase seams
that rotating global texture coordinates by a varying local angle would create.

| Structure | Noise cell scale | Normal strength | Period |
| --- | --- | --- | --- |
| Broad/medium undulation | 7.5 m | 0.50 | 4.8 s |
| Fine ripples | 1.15 m | 0.20 | 3.7 s |

Both slopes combine before lighting. Values describe noise cells/dimensionless
normal strengths, not measured wave heights. No vertex displacement occurs.
Screen derivatives fade unresolvable detail when zoomed out. Magnitude subtly
increases normal activity from 0.45 to 1 and broadens highlights, with no color ramp.

## Shading and tuning

`src/water/parameters.js` centralizes speed, both scales/strengths, periods, base
color, alpha, Fresnel and specular strengths. Development code can edit
`window.floodVelocity.waterParameters` and request a render without texture uploads.

The green-gray river base color is **[0.25, 0.34, 0.30]**, alpha **0.96**, independent
of elevation or inferred depth. East/north slopes perturb local up. The local
spherical ECEF basis is rotated into view space; the interpolated view-space position
supplies the fragment-to-camera vector.

- Public `RenderNode.sunLight` supplies scene direction, diffuse color/intensity
  and ambient color/intensity. Direction follows Esri's windmill example:
  positive `dot(normal, sunLight.direction)`.
- A restrained Lambert-style body term makes slopes readable.
- **Schlick Fresnel**: `0.02 + 0.98 (1 - N·V)^5`, strength **0.55**, blends a modest
  constant analytic sky tint at grazing angles. There is no environment map.
- **Blinn–Phong** sun highlight: exponent **100 → 48** with increasing activity,
  strength **0.65**, modulated by Fresnel. This is a simple approximation, not a
  fully energy-conserving BRDF.

No building reflections, refraction or sampled shadow maps are present. Buildings
and bridges still occlude the surface through the ArcGIS depth buffer.

## Polygon footprint and NoData

Water coverage is independent of velocity validity. `src/water/footprint.js` uses
public `queryObjectIds` / `queryFeatures` on **Zatopená oblast**, spatially filtered
by the test extent. The intersecting polygon has **14,862 returned ring vertices**
after sub-pixel generalization. Canvas even-odd filling preserves holes and clips
the geometry to the bounded rectangle.

The separate **768 × 1024 R8** footprint has approximately **0.744 × 0.761 m** pixels,
linear filtering and antialiased edges. It uploads once. Of **471,217 wet pixels**,
**375 lack usable velocity** (about **0.080%**).

Only polygon coverage controls water alpha/discard. Invalid velocity gives **zero
current and a stationary calm normal pattern**, never a hole or invented fast flow.
Adjacent validity samples reduce current near NoData boundaries over approximately
one source pixel. This is conservative boundary damping, not flow reconstruction.
Vectors continue to interpolate as components, never angles.

## Elevation and 3D positioning

The same `Ground.queryElevation → toRenderCoordinates → origin-relative static mesh`
approach is retained. Removing the 2 m diagnostic lift exposed intersections in the
old ~12 m triangles. The mesh is therefore **192 × 256 cells**, **49,601 vertices /
98,304 triangles**, about **3 m** spacing, with **2 m** requested elevation resolution.
Uint16 indices still suffice. Sampling and mesh creation happen only once.

Offset is **0.20 m**. Trials at 0.08/0.12 m still intersected the rendered ground;
one 0.12 m probe was 0.02 m below it despite full polygon coverage. The 0.20 m offset
removed obvious interior gaps in the evaluated views. It is a rendering tolerance,
not a model water-level adjustment; exact shore conformity at every terrain LOD
is not guaranteed. The terrain/water-level composite is **never interpreted as depth**.

Saved oblique, north-up, zoomed island, opposite-facing and close bridge views were
checked. Water stays geographically aligned under camera movement. The pass keeps
depth testing, disables depth writes, alpha-blends only color0 and resets GL state.
Buildings and bridges correctly cover it.

## Verification of the actual water motion

Production Vite build and Chrome integration pass. The final integration run had
no console, HTTP, JavaScript or rendering errors. Comparison visibility and the
unchanged GPU field audit pass.

**Actual water-shader** frames at deterministic times **0.65 / 1.05 s** were tracked
with subpixel image correlation against projected local field directions. Occluded,
non-water and unresolved patches were excluded. Qualified patches have correlation
above 0.8 and expected/observed movement above 0.25 pixels.

| Measurement | Wide north-up | Zoomed island |
| --- | --- | --- |
| Qualified patches | 934 | 119 |
| Median direction cosine | 0.99596 | 0.99251 |
| Direction cosine > 0.8 | 870 | 92 |

Not every patch matches: image ambiguity, phase blending and spatial distortion
remain. This is an observation of rendered motion, not exact physical validation.

For the **same wide camera** over 0.4 s, median displacement rises with magnitude:
**0.41 px** for M=2–8, **0.85 px** for M=8–18, **1.63 px** for M=18–35. Near the
island, tracked water structure moves northeast at (14.4101354, 50.0797705) and
northwest at (14.4126354, 50.0804268), matching their different local vectors.
The result is not one globally scrolling texture.

Both reset boundaries of both scales were checked at **1.85, 2.4, 3.7 and 4.8 s**,
including ±0.001 s frames. Mean wet-pixel RGB differences across the 2 ms interval
are below **0.012 on the 0–255 scale**, with 99th percentile **0.333**. No reset jump
was visible. Oblique and close views supplement these numerical checks.

**Capture caveat:** `view.takeScreenshot()` omitted most of the custom pass at one
close oblique camera, although the presented Chrome image was correct and height
probes showed water above ground. The deliverable animation captures presented
Chrome frames after each requested render instead. General offscreen SDK screenshot
compatibility is not claimed. The north-up motion frames did include the water.

Raw local evidence/scripts are in git-ignored `.verification/`:
`verify-stage3.mjs`, `motion-stage3.mjs`, `analyze-stage3-motion.py`, `record-stage3.mjs`,
`stage3-analysis.json`, `stage3-final.json`, `stage3-console.json`,
`stage3-motion-measurements.json` and deterministic screenshots.

## Performance observations

The integration run recorded **446 custom frames, one velocity upload and one mask
upload**. There are no per-frame raster fetches, mesh rebuilds or JS particle arrays.
The footprint adds **0.75 MiB** to the existing **3 MiB** velocity texture; static
vertices/indices occupy about **1.51 MiB**. Rendering remains one indexed draw plus
uniforms per frame.

Accumulated CPU submission time was **4.59 s**, about **10.3 ms/frame**, including
initial setup/readback and headless capture overhead. Stage 2 observed ~11.35 ms/frame
in a different run: comparable order of CPU overhead, **not a controlled GPU benchmark
or proof of a speedup**. Water adds fragment arithmetic and geometry. Hardware,
viewport and ArcGIS content affect actual performance; no FPS target or context-loss
recovery was established.

## Three most important remaining visual problems

1. **Pattern coherence:** strong highlights can expose stretched/banded procedural
   detail. Crossfading can look like local reshaping rather than perfectly persistent
   transport at sharp gradients. Very calm areas can look static at overview scale.
2. **Edges/elevation:** the bounded rectangle ends abruptly. Polygon rasterization,
   sampled composite ground and the 20 cm tolerance can leave small fringes near
   complex banks or terrain LOD transitions. Full-area continuity is absent.
3. **Lighting realism:** analytic sky tint/simple highlights omit surrounding
   buildings and their shadows/reflections. Water can look matte away from the light
   and overly structured toward it; it is not an optical match under every camera.

No foam, depth coloring/reconstruction, dynamic geometry, SSR, environment maps,
refraction, caustics, wakes, obstacle interactions or time-dependent hydraulic data
were added. Original Esri water remains available. **Stage 4 is not started.**

Public references: [RenderNode](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/RenderNode/),
[sun lighting](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/types/),
[windmill lighting example](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-windmills/),
[FeatureLayer queries](https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/).
