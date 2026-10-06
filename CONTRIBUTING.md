# Working on flood-water-renderer

The project is pre-1.0 and uses the [MIT License](LICENSE). Submit only work you
are authorized to contribute under that license. Third-party datasets and SDKs
retain their own terms.

## Development

Use Node.js 24 (see `.nvmrc`) and npm. From the repository root:

```sh
npm ci
npm run build:lib
npm run dev
```

The root page is the Prague demo. `/examples/minimal/` demonstrates integration
without the comparison panel. Both examples consume `dist/`; rebuild the library
after editing `src/`. The demo needs access to external ArcGIS services.

## Checks

```sh
npm run check
npm pack --dry-run
```

`check` builds the library and examples, runs the Node tests, and checks the
public TypeScript declarations. CI runs these checks on Windows and Ubuntu
with Node 24. The package inspection does not publish anything.

For rendering, camera, lifecycle or shader changes, also run the existing
browser checks with Google Chrome installed and the ArcGIS services reachable:

```sh
npm run test:browser
npm run test:prague
```

These tests use local ports 5185 and 5187 and update evidence under
`docs/stage5/`. Review those changes before committing. They are intentionally
outside the default CI job because they depend on live services and WebGL.
Historical evidence is not proof that the current revision passed a new run.

`npm run verify:clean` checks a fresh install in an ignored temporary directory.
`npm run verify:package` exercises a separately installed local archive in
Chrome; it uses port 5186 and also updates evidence. Build first.

## Boundaries to preserve

- Keep scenario URLs and IDs in `examples/prague/scenario.js`, outside `src/`.
- The host owns the view, camera, map, layers, authentication and UI.
- The adapter owns source interpretation; the renderer receives normalized data.
- Keep adjacent tile coordinates, sampling borders and animation time consistent.
- Update `src/public/index.d.ts` and documentation when changing the public API.
- Do not commit credentials, local output, `node_modules`, `dist`, or `demo-dist`.

Describe the trigger, changed behavior and verification in a pull request.
For visual changes, include comparable before/after views and note the camera,
SDK version and scenario. For bugs, include reproduction steps and a sanitized
`getStatus()` snapshot; remove tokens and other private data from logs.
