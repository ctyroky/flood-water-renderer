# Stage 5 — production module and developer API

Historical verification report. The original local handover licensing status
has since been replaced by the [MIT License](LICENSE); version remains 0.1.0.

Version **0.1.0**, implemented and verified on 2026-10-06 against
`@arcgis/core 5.1.26`. This is a private/local handover package, not an npm
publication or a claim of stable 1.0 compatibility. Rendering effects and the
Stage 4 fixed-resolution hydraulic pipeline are unchanged.

## Acceptance answers

**Can another team integrate it into an existing SceneView without understanding
RenderNode, tile-manager or shader internals?** Yes. The public entry exposes
FloodWaterRenderer, ArcGISFloodAdapter, createFloodWaterFromScenario,
FloodWaterError and version. README provides installation, input data, quick start,
parameters, lifecycle, status/errors and scenario instructions.

**Can it use existing ArcGIS layer objects without modifying internal source?**
Yes. The primary adapter constructor accepts existing ImageryTileLayer,
FeatureLayer and Ground objects plus explicit interpretation/frame metadata.
It creates no duplicate source layers. A scenario resolver is an optional shortcut.

**Does destroy leave the host SceneView usable and release owned resources?**
Yes in the repeated Chrome integration tests: all tracked library GL textures,
buffers, VAOs, programs, shaders and transform-feedback objects were released;
no library draws occurred after destruction while the camera moved. The same
SceneView hosted three successive replacements and remained ready/not destroyed.
One destruction interrupted two active tile preparations. Old results did not
populate the new run. Stop/restart and cancellation during start also passed.

**Does the minimal example use the actual distribution artifact?** Yes.
`examples/minimal/main.js` imports `../../dist/flood-water-renderer.js`, with no
internal imports. A separate clean consumer also installed the local `.tgz` and
used the bare `flood-water-renderer` package export. Both rendered water in Chrome.
The installed JS was byte-compared with the root distribution.

**Are Prague source IDs absent from the reusable distribution?** Yes. Automated
checks reject current scene/service IDs, source names and geographic origin in
the built JS. Source identity search finds them only in the Prague example;
no source IDs appear in reusable src code. The distributable contains no scenario,
screenshots, Stage reports or test scripts.

## Repository organization

```text
src/public/             facade, errors, parameters, scenario helper, entry + types
src/data/               reusable ArcGIS adapter and normalized contract
src/water/              shared grid, camera selection, cache and visual defaults
src/render/             water RenderNode, GPU utilities, embedded GLSL sources
examples/prague/        configured WebScene demo + optional controls and CSS
examples/minimal/       existing-object integration against built JS
index.html              Prague example entry
vite.lib.config.js      ESM library build; SDK externalized
vite.config.js          separate demo build
scripts/                clean-install and packaged-consumer verification
 tests/                 unit, type, browser and shader-seam verification
 docs/                  integration docs + historical visual evidence
 development/           retained Stage 1–4 inspection/debug snapshots and shader
 STAGE1.md … STAGE5.md   engineering history; not integration prerequisites
 dist/                  actual reusable build (generated)
 demo-dist/             separate built examples (generated)
```

Historical diagnostics remain available under development and .verification.
Their old application entry points are explicitly labelled historical snapshots.
No library source depends on examples, development, .verification or files outside
the repository. Verification uses project-local Playwright and TypeScript instead
of the machine-specific cached tools used in early stages.

## Public API and ownership

```js
const adapter = new ArcGISFloodAdapter({
  flowLayer, footprintLayer, ground: view.map.ground,
  flowRepresentation: 'vector-magdir', directionConvention: 'flow-from',
  coordinates: { origin: [longitude, latitude] }, magnitudeReference
});
const water = new FloodWaterRenderer({ view, adapter, parameters, options });
await water.start();
water.setParameters({ flowSpeed: 2.5, brightness: 1.4, reflection: 1.5, waterColor: .65 });
water.getParameters();
water.getStatus();
water.stop();
water.destroy();
```

The constructor performs validation without asynchronous acquisition or GPU work.
start is idempotent when running; calls while starting share one pending promise.
It waits for the host view, validates sources, attaches the water node and waits
for GPU program initialization. It does not wait for all camera-selected tiles.
The first usable water draw is a separate ready event.

stop cancels/ignores work, removes camera/view watches, destroys the custom node,
releases the complete cache and enters stopped. Parameters persist; restart uses
fresh resources and a new common animation clock. This deliberate release-all
policy is simple and predictable; comparison switching back from Esri water must
reload custom tiles. It is not an invisible long-lived cache mode.

destroy is permanent/idempotent, clears listeners and references and never
calls SceneView.destroy or destroys source layers/ground. Snapshot getters remain
available; start/setParameters/on reject after destruction. Host-view destruction
is also watched defensively during initialization and operation.

One active renderer per view and one active user per adapter are enforced with
WeakMap reservations. Duplicates fail clearly with VIEW_IN_USE / ADAPTER_IN_USE.
The library never changes camera, map, source visibility or application UI.
The optional example controls own comparison visibility and restore their prior
values on disposal/fatal failure. No WaterSymbol3DLayer-specific knowledge is
required by the renderer.

## Adapter and data contract

ArcGISFloodAdapter borrows source objects. It validates ImageryTileLayer,
Vector-MagDir, two bands, EPSG:4326, explicit flow-from convention, polygon
footprint and one active elevation layer in the host Ground. A FlowRenderer is
not required; if one exists, a conflicting convention is rejected. Current
conversion remains east=M sin(D), north=M cos(D); physical units are not inferred.

The adapter returns normalized component/validity pixels, independent polygon
coverage, static origin-relative render-space geometry, global frame metadata and
geographic sampling information. The facade validates returned tiles. Optional
adapter metrics do not affect rendering. initialize/loadTile/release form the
extension boundary for another backend; none was implemented or fabricated.

Responsibility mapping, array ownership, UV conventions, border sampling,
coordinate frame and lifecycle are documented in [data-contract.md](docs/data-contract.md).
[architecture.md](docs/architecture.md) describes the host/library boundary.

## Parameters, status, events and errors

Supported partial parameters: flowSpeed 0.25–5 (default 1), brightness 0.5–2 (1),
reflection 0–2 (1), waterColor 0–1 (.45), opacity 0–1 (.96), paused boolean (false).
Updates validate atomically, reject unknown names/nonfinite values and copy inputs.
Instances do not share mutable appearance parameters. Changes only touch uniforms
and the common clock, not hydraulic data or geometry.

getStatus returns plain snapshots: lifecycle state, ready flag, scenario ID,
coverage-limit flag, tile counts, approximate CPU/GPU bytes, acquisition/cache/upload
statistics and concise last error. It exposes no mutable records, node methods or
GPU resource handles. ready fires once per run; statuschange fires on material
state/residency/parameter changes, not each animation frame. on returns an
unsubscribe function. error carries a FloodWaterError with code/message/fatal,
optional tileId and an underlying cause for developer inspection.

Initialization/GPU errors fail start or move an active run to error after cleanup.
Individual tile errors remain isolated with up to three acquisition attempts.
The already-aborted start path consumes late rejections, avoiding unhandled
promise errors. Error codes and handling examples are listed in README.

## Build, dependency strategy and distribution

Vite library mode produces one ESM JS file and copies maintained declarations.
All `@arcgis/core` subpaths are external. Package metadata declares the exact
5.1.26 peer, plus development installation for examples/tests. A host supplies
its existing SDK; package installation verified a single deduplicated instance.
No compatibility with untested SDK releases is claimed.

The water GLSL is embedded as JS strings. Only the water program is compiled;
the historical diagnostic arrow program and one-time GPU readback audit are
excluded from the production entry. This packaging change removes debug work,
not water behavior. There are no normal/noise images or other library runtime
assets, and no renderer CSS. Normal ArcGIS SDK assets/styles remain host concerns.

| Actual dist file | Uncompressed bytes |
|---|---:|
| flood-water-renderer.js | 49,295 |
| flood-water-renderer.d.ts | 6,363 |

The JS gzip estimate is about 16.2 kB. No SDK implementation is bundled. Package
exports expose only the intentional entry; internal paths are not supported API.
The local npm archive has six files: the two dist files, README, package.json,
docs/architecture.md and docs/data-contract.md. `private:true`, version 0.1.0,
the original local handover license status, exports/types/files/peerDependencies/
scripts were set. Nothing was published during Stage 5. Current project code and
documentation are MIT licensed; third-party data and SDK terms remain separate.

The original local handover archive was
`flood-water-renderer-0.1.0.tgz`, **27,829 bytes**. Archives are not tracked;
run `npm run build:lib` and `npm pack` to generate one from the current checkout.
The tested JS SHA256 is
`5aba81ab9f212ed5f76020e8cd3d7802149ffbdaa4423860c7153616d130f81a`.
Both the direct-dist integration and clean installed-package reports match it.

TypeScript 5.9.3 checked the actual built declarations with strict mode and
skipLibCheck=false against the installed SDK. Tests cover autocomplete-facing
classes, parameters/status/scenario types, accepted partial updates and rejected
unknown parameters/internal APIs/conventions. Internals remain JavaScript.

## Verification

Commands are documented in README. Build succeeds for library and both examples;
the expected large SDK chunk warning concerns demo-dist, not the 49 kB library.
Seven final Node tests pass: parameters/atomic validation, cancelled-promise
handling, distribution isolation/shader inclusion, grid alignment/scenario keys,
color defaults, cache deduplication/reuse/eviction/cancellation and bounded failure
isolation. No new framework or CI/deployment infrastructure was introduced.

A new clean repository subset with no node_modules, screenshots, Stage reports or
.verification inputs was installed using npm ci, built, unit/type checked and
packed successfully. A second **independent host** installed the real local npm
archive plus its own @arcgis/core and Vite, built successfully, and displayed water
in Chrome. npm ls showed the package peer deduped to the host's single SDK copy.
This Windows environment required Node's `--use-system-ca` for its trusted network
certificate chain; TLS verification was not disabled and no project TLS override
was introduced.

Browser tests run through project-local Playwright in installed Chrome. The
minimal example has no imported TileManager, RenderNode, shader or contract helper.
Its test harness instruments public WebGL calls to count real owned resources;
that instrumentation is not part of the example or package.

### Lifecycle/resource evidence

Three destroy → create → start cycles used the same SceneView. Cycle 1 interrupted
two loading tiles. In every cycle:

- old textures, buffers, VAOs and programs had zero live tracked handles;
- temporary compiled shader handles were deleted after linking;
- no old library draw occurred after destroy during camera navigation;
- host view remained ready/not destroyed and a new renderer drew normally;
- repeated destroy was safe; subsequent start on the destroyed object rejected;
- new requests/resources belonged to the new run, not the disposed one.

Stop released resources and later start preserved parameters. Two simultaneous
start calls shared their promise; cancelling them rejected both as ABORTED.
A deliberate failing initialization produced INITIALIZATION_FAILED, a fatal error
event with retained cause, and an error-state snapshot. Duplicate attachment was
rejected before creating an extra node. No internal render-graph access was needed
by the consuming application or library.

### Stage 4 rendering/performance regression

The real built shader was inspected via public WebGL APIs and used with its real
captured tile textures/uniforms. **316 shared-boundary samples** at four deterministic
times (.65, .75, 4.799, 4.801 seconds) had **zero RGBA difference**, GL error zero;
207 results varied over time. Thus packaging preserved global procedural phase
and sampling at the tested seams, including phase reset.

Navigation included the central river, oblique bridge view, Holešovice and the
southern restart region. Footprint/alignment, bridge/building occlusion and local
flow structure remained visible. The unchanged shader/conversion preserve the
Stage 3 physical-convention caveats and velocity-dependent animation behavior.

Returning to the previous nearby view kept velocity requests at 13 while cache
hits increased from 16 to 32. Each ready resident tile uploaded once; controls did
not increase request or upload counts. One water program compiled per run, never
per frame/tile. Initial test occupancy was 10 water tiles / 39.98 MiB per CPU and
GPU payload, comparable to Stage 4. Warm-cache acquisition observations were of
the same order as Stage 4 (hundreds of milliseconds per velocity/elevation tile);
CPU submission was a few milliseconds in tested captures. These are not controlled
GPU benchmarks or guaranteed performance gains. Removing the unused diagnostic
program/readback reduces setup work, not tile rendering complexity.

The Prague demo separately passed all four sliders, pause and Esri/custom/both
comparison modes. A captured loading-phase frame was replaced with a settled view;
start/ready intentionally does not imply that every visible tile is loaded.
Final browser runs recorded no persistent JavaScript/console/HTTP errors.

Evidence: [integration measurements](docs/stage5/integration.json),
[installed package](docs/stage5/package-consumer.json),
[Prague controls](docs/stage5/prague.json),
[minimal bridge view](docs/stage5/minimal-oblique.png),
[installed-package screenshot](docs/stage5/installed-package.png),
[Prague screenshot](docs/stage5/prague-controls.png).
The integration and packaged-consumer reports record the exact distribution SHA256.

## Handover check

1. **Install/build:** README gives npm ci/build/example and npm pack/local install.
2. **Inputs:** existing view, flow ImageryTileLayer, polygon FeatureLayer, host
   Ground, fixed frame and explicit magnitude/direction interpretation.
3. **Start:** construct adapter/renderer; await start; observe ready/status.
4. **Tune:** setParameters(partial); validated ranges and defaults are tabulated.
5. **Stop/destroy:** documented release-all restart policy; host view remains owned
   and usable by the application.
6. **Diagnose:** typed snapshot, three small event types, error codes and causes.
7. **Another scenario:** replace object/config sources and frame metadata; use the
   optional role resolver if helpful. No shader edits or persistent tile pipeline.

## Limits and stopping point

Still fixed resolution with a 36-required-tile cap at overview/horizon scale,
regional tangent approximation, possible bank/elevation fringes, unknown source
physical units and inherited analytic water shading. Long jumps and stop/restart
can show loading gaps. Global SceneView only; no SSR/worker rendering, generalized
SDK screenshot guarantee, complete context-loss certification or untested SDK
version compatibility. Only one active renderer per view/adapter is supported.

No LOD, new hydraulic formats, persistent/custom tiles, foam, depth effects,
dynamic geometry, SSR/building reflections, refraction, wakes, spray, obstacle
interaction, hydraulic time series, npm publication or deployment infrastructure.
Stage 5 stops at the built, documented and independently exercised module.
