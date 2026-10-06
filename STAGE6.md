# Stage 6 - public repository and GitHub Pages demo

Version **0.1.0**. The repository is public and project source/documentation use
the **MIT License**, copyright 2026 Jiří Čtyroký. Package `private: true` remains
enabled to prevent npm publication. No npm package or GitHub Release was published.

- Repository: https://github.com/ctyroky/flood-water-renderer
- Live demo: https://ctyroky.github.io/flood-water-renderer/

## Deployment architecture

`npm run build:pages` builds the reusable ESM library into `dist/`, then runs Vite
with mode `pages`. `examples/prague/main.js` still imports the normal
`dist/flood-water-renderer.js` artifact and uses the existing Prague scenario.
There is no second renderer implementation or hosted-only rendering behavior.

`vite.config.js` sets base `/flood-water-renderer/` for Pages mode and includes
only the Prague entry. Vite emits JavaScript, CSS and asset references beneath
that base into `demo-dist/`. The default build still includes both examples at
the domain root. Generated library/demo output remains ignored by Git.

GitHub Pages uses **GitHub Actions** as its publishing source. The separate
`.github/workflows/pages.yml` workflow runs on main pushes or manual dispatch in
the canonical public repository:

1. Check out source, set up Node 24 and install with `npm ci`.
2. Run the Pages build, Node tests and public TypeScript checks.
3. Configure Pages with `actions/configure-pages@v5` and upload `demo-dist` with
   `actions/upload-pages-artifact@v4`.
4. Deploy the artifact with `actions/deploy-pages@v4` in the `github-pages`
   environment.

Build permissions are `contents: read` and `pages: read`. Only the deployment
job receives `pages: write` and `id-token: write`. No generated hosting branch,
committed site output, credentials in source, or post-build path rewriting is
used. The existing Windows/Ubuntu CI workflow is unchanged.

## Public dependencies and publication checks

Before public visibility was enabled, the reachable history and current
publication files were reviewed, including Stage reports, configuration,
examples, historical images and the PDF. No confirmed sensitive material was
found. The audit scope and limitations are recorded in
[docs/publication.md](docs/publication.md). Existing history was preserved.

Nineteen anonymous ArcGIS metadata, style and query requests succeeded. The
WebScene `2067a314e0094fc5899a700d78f732cc` and referenced portal items reported
public access. Checks included:

- Flood footprint: `ZC_5160/FeatureServer/0`, including a successful polygon query.
- Velocity: `MagDir_5160_wgs/ImageServer`, including an actual bounded LERC tile.
- Ground: `teren_hladina5160/ImageServer`, including an actual elevation tile.
- Referenced buildings, bridges, flood-protection layers and basemap style/service.

The velocity and elevation samples returned HTTP 200 with CORS allowing the
Pages origin. These checks used no authentication token, cookie or Authorization
header. No ArcGIS credentials or authentication workaround was added. Anonymous
access does not change the separate licensing/attribution terms of ArcGIS and
the datasets.

## Verification results

The preparation commit was `9e102ea57d83aa72b588a953b9e2988ccc1e9e57`.
Its [Windows/Ubuntu CI run](https://github.com/ctyroky/flood-water-renderer/actions/runs/37526814051)
and [initial Pages deployment](https://github.com/ctyroky/flood-water-renderer/actions/runs/37527149809)
both succeeded. The deployed HTTPS page returned HTTP 200 anonymously. Its 507
generated HTML asset references used `/flood-water-renderer/assets/`; the local
Pages artifact check resolved all referenced files.

**Final browser verification: passed manually by the project owner.** After
deployment, the owner opened the public URL in a regular Chrome browser and
confirmed that the Prague demo loads and works normally. This owner-performed
test is the accepted final browser verification for Stage 6. It is distinct
from the automated test result below; no successful automated browser run is
claimed.

The earlier automated Codex Chrome run was blocked by
`net::ERR_CERT_VERIFIER_CHANGED` on 77 JavaScript asset requests. The page itself
returned 200, but that session remained at "Loading flood WebScene..." and timed
out before rendering/control/navigation assertions could run. No HTTP error
status or credential-bearing/local-machine request was recorded in that partial
run. Certificate validation was not disabled. The subsequent successful owner
test establishes this as an **environment-specific automated-browser limitation,
not a renderer or GitHub Pages defect**.

Local `npm run check` covers both builds, all seven Node tests and public type
checks. These checks are rerun for the Stage 6 completion commit, followed by
the existing CI and Pages workflows. Browser success is based on the owner's
manual verification, not merely the successful deployment job.

## Runtime architecture and limitations

No renderer implementation, scenario, layer setup or appearance controls were
changed for hosting. The library build retained its Stage 5 SHA-256:
`5aba81ab9f212ed5f76020e8cd3d7802149ffbdaa4423860c7153616d130f81a`.
Runtime geographic water tiles, bounded raster requests, shared world-space
animation and CPU/GPU residency limits are unchanged. There are no pre-generated
custom water tiles, per-frame raster fetches, duplicate SceneViews or extra
source layers introduced by the Pages deployment.

The hosted demo has the same renderer behavior as the local Prague demo. Hosting
differences are the production bundle, HTTPS origin and base path; the minimal
example is not included in the Pages artifact. Existing limits remain: external
service/network availability, WebGL2/global SceneView requirements, loading gaps
after long camera moves, fixed-resolution tile limits and visually scaled flow
with undocumented source velocity units. The demo build retains Vite's warning
about large ArcGIS chunks. No hosted performance improvement or new benchmark
is claimed, and the automated browser limitation remains documented above.
