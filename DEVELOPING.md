# How this works

There are 2 main parts of the app:

1. renderer: this is the HTML/Javascript-based UI rendered within the Electron container. This runs Vue.js, a React-like Javascript framework for rendering front-end.
2. main: includes the main app (written in Electron). Handles keyboard shortcuts, brings up the UI and overlays.

Note that these 2 both depend on each other, and one cannot run without the other.

# How to develop

The most up-to-date build instructions can be derived from
[the CI workflow](./.github/workflows/ci.yml).

```sh
cd renderer
npm ci
npm run make-index-files
npm run dev

# In a second shell
cd main
npm ci
npm run dev
```

# How to build

```sh
cd renderer
npm ci
npm run make-index-files
npm run lint
npm test
npm run build

cd ../main
npm ci
npm run build
# We want to sign with a distribution certificate to ensure other users can
# install without errors
CSC_NAME="Certificate name in Keychain" npm run package
```

# Dependency deprecation warnings

`npm ci` in `renderer` is warning-free. `npm ci` in `main` still prints four
`npm warn deprecated` lines. All four come from transitive dev dependencies of
`electron-builder`/`electron-updater` that we cannot reach from here, so they are
expected and can be ignored:

| Package | Reached via | Why it is stuck |
| --- | --- | --- |
| `lodash.isequal@4.5.0` | `electron-updater` | Still a direct dependency of the latest `electron-updater`. |
| `glob@7.2.3`, `inflight@1.0.6` | `@electron/asar@3.4.1` | `app-builder-lib` pins `@electron/asar` to an exact `3.4.1`. `@electron/asar@4` moves to `glob@13` but changes its module shape, which `@electron/universal` still consumes as a CJS default import. |
| `rimraf@2.6.3` | `electron-builder-squirrel-windows` → `electron-winstaller` → `temp@0.9.4` | `temp` has published nothing newer than `0.9.4`. We never build a Squirrel target (see `electron-builder.yml`), but `electron-builder-squirrel-windows` is a non-optional peer of `app-builder-lib`, so npm installs it regardless. |

The warnings that *were* fixable are handled by version bumps and by the
`overrides` blocks in `main/package.json` and `renderer/package.json`. Those
overrides exist purely to pull deprecated transitive packages forward; drop an
entry once the parent package stops needing it:

- `main`: `global-agent@^4` — `@electron/get` asks for `^3`, which drags in the
  deprecated `boolean` and `roarr`. v4 dropped both and keeps the single
  `bootstrap()` call `@electron/get` makes (inside a `try`/`catch`, and only when
  `ELECTRON_GET_USE_PROXY` is set).
- `renderer`: `magic-string@^0.30` — `@vue/compiler-sfc@3.2.37` asks for `^0.25`,
  which depends on the deprecated `sourcemap-codec`. Vue moved to the same
  `^0.30` range in 3.3. Removable once `vue` is upgraded past 3.2.
- `renderer`: `js-beautify@^2` — `@vue/test-utils` asks for `^1.14.9`, whose
  newest release still uses the deprecated `glob@10`. `js-beautify` is only used
  to pretty-print HTML in test output.
- `renderer`: `nopt@^8` / `abbrev@^3` — `js-beautify@2` pulls `nopt@10`, whose
  `engines` field excludes odd-numbered Node releases and produces `EBADENGINE`
  warnings for anyone on Node 23/25. Both are only used by the `js-beautify` CLI.

`tailwindcss@3` also reached the deprecated `glob@10` through `sucrase@3.35.0`;
`sucrase@3.35.1` swapped it for `tinyglobby`, so a lockfile refresh was enough.

# CI, releases, and upstream updates

- Pull requests and pushes to `main` run
  [CI](./.github/workflows/ci.yml) without publishing an installer.
- Pushing a tag such as `v3.29.200` runs
  [Release](./.github/workflows/release.yml). The tag must match the version in
  `main/package.json`. Windows, Linux, and macOS packages and updater metadata
  are published to the matching GitHub Release.
- [Sync upstream](./.github/workflows/sync-upstream.yml) runs every Monday and
  can also be started from the Actions tab. It merges the original project's
  `master` branch into `chore/sync-upstream` based on this fork's `main` branch
  and opens or refreshes a pull
  request for review.

For the sync workflow to open pull requests, enable **Allow GitHub Actions to
create and approve pull requests** under **Settings > Actions > General >
Workflow permissions** in the GitHub repository. The workflows grant write
access only to the release and sync jobs that need it.

The packaged app checks the releases from `RadioactiveCheese/krangled-poe-trade`
because that publisher is configured in `main/electron-builder.yml`.
