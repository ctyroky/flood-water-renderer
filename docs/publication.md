# GitHub publication and public-release preparation

Repository: https://github.com/ctyroky/flood-water-renderer

Project source and documentation use the [MIT License](../LICENSE), with
copyright attributed to Jiří Čtyroký from Git author metadata. Package version
remains 0.1.0. Third-party ArcGIS SDKs and datasets retain their own terms.

## Repository contents

Keep source, examples, tests, scripts, the npm lockfile, Markdown documentation,
the PDF guide, and the existing historical screenshots/reports. Generated
libraries, demo builds, archives, local logs and PDF render scratch files are
ignored. Historical reports under `STAGE*.md` and `docs/stage*/` describe earlier
verification runs and are not current CI results.

## Choices before publishing

- Repository ownership/name remain ctyroky/flood-water-renderer. Public visibility
  and Pages have been explicitly authorized by the owner.
- `private: true` in package.json prevents npm publication, not a public GitHub
  repository. No npm publishing or GitHub Release workflow is configured.
- Confirm that the intended visibility is appropriate for the source and the
  existing map screenshots, service references and data attribution. ArcGIS and
  the Prague services have their own terms; no dataset license is supplied here.
- Review Git author metadata and the existing history before sharing it. An
  ignore rule does not remove a file from earlier commits. Do not rewrite shared
  history without a separate decision.

## Local verification

```sh
npm ci
npm run check
npm pack --dry-run
git diff --check
git status --short
```

Run the browser checks described in [CONTRIBUTING.md](../CONTRIBUTING.md) when
validating the live demo. Review pending files and scan for credentials before
the first upload. Pattern-based scans are useful but not a guarantee that no
secret exists, particularly in binary artifacts.

## After a repository is explicitly authorized

Preserve the existing repository and history. Commit reviewed changes and wait
for CI before changing visibility. The separate Pages workflow is guarded so
that it deploys only from the canonical public repository. It builds from source
and uploads demo-dist as an artifact; generated output is not committed.

## Original private-publication verification (2026-10-06)

- Windows / Node 24.21.0: library and both example builds passed, all 7 Node
  tests passed, and public TypeScript declaration checks passed.
- `npm pack --dry-run` included the two library outputs, package metadata,
  README, LICENSE, architecture and data-contract documents. It did not include
  example datasets, temporary output, dependencies or credentials.
- Local links in the new/updated onboarding documents resolved, and the copied
  Czech PDF contains 14 pages.
- A credential-pattern scan of reachable Git-history text and candidate working
  files found no matches. Binary history was excluded; the current PDF's
  extracted text was also scanned. This is not a comprehensive security audit.
- Live-service browser tests and a fresh dependency installation were not rerun
  for these documentation/configuration changes. The build retained the existing
  warning about large ArcGIS demo chunks. GitHub-hosted CI has not run yet.

The CI workflow uses the documented
[checkout](https://github.com/actions/checkout) and
[setup-node](https://github.com/actions/setup-node) actions. It requests read-only
repository permissions and does not retain checkout credentials. The initial
GitHub-hosted run subsequently passed on Windows and Ubuntu.

## Public-release audit (2026-10-06)

The full reachable local history, including the local checkpoint ref, contained
4 commits and 110 unique file blobs. Credential, private-key, npm-token,
credential-bearing URL, personal filesystem path and unintended file checks
found no confirmed sensitive content. The only path-pattern match was the
public ArcGIS `/home/webscene/` URL, not a personal filesystem path.

The review covered Stage reports, configuration, examples, the PDF's text and
metadata, and 23 historical image assets. The images show the demonstration and
an initial Vite template asset; the largest file is about 2.1 MB. Existing author
names and the professional Git email remain in commit metadata. No history is
rewritten or anonymized. Pattern checks are not a formal security audit.

Anonymous requests succeeded for the WebScene and its referenced portal items
(all public), layer metadata, basemap style and flood polygon query. Bounded
sample velocity and elevation LERC tiles returned HTTP 200 and CORS allowing the
Pages origin. No token, cookie or Authorization header was used. This verifies
access, not a transfer of dataset ownership or licensing.
