# Deploying the Prague demo

The demo is a static website. Node.js is needed to build it, not to serve it.
The reusable npm-style library output and the website output are separate.

## Domain root

```sh
npm ci
npm run build
```

Upload `demo-dist/index.html` and the **entire** `demo-dist/assets/` directory to
the web root. Also upload `demo-dist/examples/` if you want the minimal example.
Preserve filenames and directory structure. Do not upload the source `index.html`,
`src/`, `node_modules/`, or the library-only `dist/` directory as the website.

## Subdirectory (including GitHub Pages project sites)

For a site at `https://example.com/flood/`:

```sh
npm run build:lib
npm run build:examples -- --base=/flood/
```

Upload the resulting website contents into that `flood/` directory. Replace the
base with the actual URL path. For a GitHub Pages project site this is normally
the repository's path. Rebuild when the hosting path changes; the default build
uses `/assets/...` URLs and assumes a domain root.

## Verify the deployment

Serve over HTTPS with JavaScript, CSS and WebAssembly MIME types supported by
the host. Open the site and confirm the scene and custom water both load; inspect
the browser network panel for missing assets or rejected ArcGIS requests.
`npm run preview` serves the most recent local demo build for inspection.

The Prague example loads a WebScene and datasets from external ArcGIS services.
Those services, their access settings, attribution and terms remain separate
from the renderer. The site is not an offline dataset bundle. A restrictive
Content Security Policy must allow the resources needed by the host scene and
SDK; do not embed private tokens in static assets.

No deployment workflow is included. CI only validates code and builds; it does
not enable Pages, upload a site, create releases or publish to npm.
