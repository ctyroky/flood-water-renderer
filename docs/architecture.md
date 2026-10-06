# Architecture and ownership

The public ESM entry exports FloodWaterRenderer, ArcGISFloodAdapter,
createFloodWaterFromScenario, FloodWaterError and version. Public declarations are
maintained in src/public/index.d.ts and copied into the build. Internal paths are
not package exports and may change without notice.

```text
host application: SceneView / map / sources / visibility / UI
       │ borrowed objects
       ▼
ArcGISFloodAdapter: validate metadata → bounded ArcGIS queries → normalized tiles
       │
FloodWaterRenderer: lifecycle / public parameters / events / snapshots
       ├── fixed geographic grid + camera selection
       ├── TileManager: queue, abort, retry, bounded LRU residency
       └── TiledWaterRenderNode: static textures/mesh + common water shader/time
```

The renderer never creates/destroys a SceneView or changes its camera/map/layers.
It changes only its own RenderNode integration and GPU resources. The host retains
ownership of sources and comparison visibility. Optional controls live entirely
in examples/prague and use the public API.

The renderer reserves one active slot per view and per adapter using WeakMaps.
stop releases watches, cancels requests, clears records, destroys the node and
calls adapter.release. destroy additionally clears listeners and host references.
Start-generation checks prevent obsolete asynchronous results from becoming the
new run. SDK queries receive AbortSignals; their internal cache behavior is owned
by the SDK. A non-cooperative future adapter must still settle/cancel its own work.

start resolves after source validation and GPU program initialization. First
usable water is a separate ready event. A run may be active with no visible water.
stop has intentionally simple, memory-free semantics rather than retaining an
invisible cache. Restart reacquires tiles and restarts the clock; parameters persist.

RenderNode.createSubclass's SDK lifecycle calls the subclass and base destroy
methods; base destruction removes the node from the host render graph. The custom
destructor deletes its textures, buffers, VAOs and program first. A cached GL
reference permits cleanup even if the host starts tearing down the view.
No internal ArcGIS renderer collections are used by the library.

Source semantics stay in the adapter. Tile residency and GPU upload stay in the
renderer. The common frame, world offsets, velocity overlap, mesh edge inputs,
phase periods and activity reference stay identical across tiles. Packaging does
not change the Stage 4 water fragment shader or source conversion.

Production compiles only the water program. The historical diagnostic arrow
shader and GPU readback implementation are retained for engineering use but are
not executed or bundled into the production entry. Public statistics need no GPU
readback. No shader/normal-map files must be copied by consumers.

Build: Vite library mode externalizes every @arcgis/core import/subpath. The peer
is pinned to the only tested version, 5.1.26, and supplied by the host. The demo
build is separate (demo-dist). Package inclusion is restricted to dist, README,
package metadata and these two integration documents; examples/evidence are excluded.

References: [Vite library mode](https://vite.dev/guide/build.html#library-mode),
[ArcGIS RenderNode](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/RenderNode/),
[Accessor lifecycle](https://developers.arcgis.com/javascript/latest/references/core/core/Accessor/).
