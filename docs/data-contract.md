# Normalized flood data contract (0.1)

Normal application developers provide existing ArcGIS objects to ArcGISFloodAdapter.
This document describes the extension boundary for adapter authors. It does not
require consumers to manipulate GLSL, textures or buffer handles.

## Operations

```js
const descriptor = await adapter.initialize({ view, signal });
const tile = await adapter.loadTile(tileRequest, signal);
adapter.release?.();
```

initialize returns a plain FloodSourceDescriptor:

- id: stable scenario/revision identity; cache keys also contain scheme/level/x/y.
- coverage: WGS84 geographic xmin/ymin/xmax/ymax.
- coordinates.origin: fixed [longitude, latitude] in degrees for the entire run.
- magnitudeReference: positive scenario-wide appearance reference, not a per-tile
  maximum or a velocity unit conversion.
- tiles: complete TileScheme (size, logical texture dimensions, borders, mesh cells,
  scheme string and fixed level). Only one level is selected today.

The adapter may read the borrowed view for coordinate conversion but must release
that reference on release. It must not destroy the view or sources. initialize
can be called again after release. One adapter cannot serve concurrent renderers.
A rejected initialize fails start; rejected loadTile only fails its tile.
Honor signal promptly and do not mutate shared run state from obsolete operations.

## Request and result

FloodTileRequest contains id, integer x/y, level, logical geographic extent,
worldOffset=[east,north] and sizeMeters=[width,height] in the shared frame. The
existing adapter builds an identical deterministic grid for its padded acquisition.

An empty tile returns `{...request,empty:true,bytes:0}`. It means **no polygon
water coverage**, not merely no velocity. A nonempty tile returns the request plus:

| Field | Contract |
|---|---|
| field | Float32Array RGBA, dimensions, geographic fetched extent, UV transform |
| waterFootprint | Uint8Array single-channel coverage, dimensions/extent/UV |
| surface.vertices | Float32Array, five values per vertex: origin-relative XYZ then logical U,V |
| surface.indices | Uint16Array triangles; valid vertex indices |
| surface.origin | three finite Float32/Float64 render-space coordinates |

`bytes` is recomputed from retained arrays by contract validation. Do not attach
GPU handles or reuse/mutate returned buffers. Extra diagnostic metadata is optional
and not needed by the renderer. Validation checks dimensions, types, finite
geometry/vectors, indices, binary flow validity, and zeroed invalid samples.

## Velocity and pixel georeferencing

R = east component, G = north component, B = original nonnegative magnitude,
A = 1 valid / 0 invalid. All values finite; invalid RGBA must be exactly zero.
No angles, source band IDs or FlowRenderer resources are sent to the shader.
Rows run from north to south. Geographic extent describes outer pixel edges:

```text
longitude = xmin + (column + 0.5) * (xmax - xmin) / width
latitude  = ymax - (row + 0.5) * (ymax - ymin) / height
```

Logical geometry UV has southwest=(0,0), northeast=(1,1). Each texture's
`uv=[offsetU,offsetV,scaleU,scaleV]` maps logical UV to padded southwest-up UV.
The shader flips V once to sample north-first pixels. Current padding is 2 pixels
per side, so offset=2/(N+4), scale=N/(N+4). Adjacent padded textures must have
compatible sample centers/values at shared positions. Render only the logical area.

The ArcGIS implementation fetches bands [0,1] with nearest resampling and converts
masked Vector-MagDir degrees to east=M sin(D), north=M cos(D). This targets the
explicit current flow-from interpretation. It is not a universal direction
convention. Source interpretation/conversion and physical validation belong to the
adapter/data publisher. Components, never wrapped angles, are interpolated.

## Coverage and elevation

Footprint bytes are independent water coverage 0–255, including antialiased
polygon edges and holes. The GPU uploads them as R8. Velocity uses RGBA32F with
manual validity-aware component interpolation. No usable velocity in a covered
water area gives a calm stationary pattern, not a water hole or fabricated current.

Surface XYZ is in the host view's public toRenderCoordinates frame, relative to
a tile origin. Global SceneView render space is spherical ECEF here, not public
Web Mercator coordinates. UV is logical tile UV. All neighboring mesh boundary
vertices must use identical geographic/elevation inputs. Current mesh uses 192²
cells and Ground.queryElevation at 2 m resolution with +0.20 m z-fighting tolerance.
Elevations are never interpreted as depth.

The shared frame uses R=6378137 m, north scale Rπ/180, east scale additionally
multiplied by cos(origin latitude). Tile worldOffset is an exact integer multiple
of sizeMeters. One east/north/up basis, global time and procedural coordinates
are shared by the whole run. This regional approximation must be reconsidered
for substantially larger/geographically different scenarios. A future rigorous
coordinate adapter must preserve cross-tile phase and vector-basis consistency.

## Responsibility and memory ownership

| Responsibility | Owner |
|---|---|
| Source identity, band/angle/unit interpretation | Adapter / host configuration |
| ArcGIS pixel, polygon and elevation queries | Adapter |
| Magnitude/direction → masked components | Adapter |
| Surface preparation and geographic/render conversion | Adapter |
| Tile selection, retries, residency and eviction | Renderer / tile manager |
| GPU upload, disposal and water appearance | Renderer / shader |
| SceneView/map/layers/camera/authentication/visibility/UI | Host application |

Ownership of returned arrays passes to the run cache until eviction/stop/destroy.
The adapter must not retain all acquired tiles as a second unbounded cache.
CPU arrays remain resident for GPU recreation. Approximate memory counts exclude
SDK-managed data, transient query buffers and driver overhead. Each ready tile is
uploaded once per GPU context lifetime; visual parameter changes never upload it.
release drops adapter run-specific references; the borrowed source objects remain
usable and caller-owned. stop/destroy cancel/ignore in-flight results before they
can populate another run.

Optional adapter metrics are plain numeric request/completion/time counters; absent
metrics are treated as zero. No per-tile public event stream or mutable manager
records are exposed to normal application consumers.
