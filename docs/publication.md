# GitHub publication handoff

The project is prepared locally. No GitHub repository, remote URL or deployment
is created by the preparation changes.

## Repository contents

Keep source, examples, tests, scripts, the npm lockfile, Markdown documentation,
the PDF guide, and the existing historical screenshots/reports. Generated
libraries, demo builds, archives, local logs and PDF render scratch files are
ignored. Historical reports under `STAGE*.md` and `docs/stage*/` describe earlier
verification runs and are not current CI results.

## Choices before publishing

- Choose the GitHub owner, repository name and visibility. No URLs in package
  metadata are invented before that choice.
- The project deliberately remains `UNLICENSED`; `LICENSE` records that status.
  `private: true` in package.json prevents npm publication, not a public GitHub
  repository.
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

Create the chosen repository, then set the real `repository`, `bugs` and
`homepage` package metadata as appropriate. Commit the reviewed files, connect
the approved remote and push the intended branch. Enable repository settings
such as branch protection and private vulnerability reporting if desired.
Those account-side actions are intentionally deferred.

## Preparation verification (2026-10-06)

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
repository permissions and does not retain checkout credentials. Its first
GitHub-hosted run can only be verified after publication.
