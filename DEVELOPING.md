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

# CI, releases, and upstream updates

- Pull requests and pushes to `master` run
  [CI](./.github/workflows/ci.yml) without publishing an installer.
- Pushing a tag such as `v3.29.200` runs
  [Release](./.github/workflows/release.yml). The tag must match the version in
  `main/package.json`. Windows, Linux, and macOS packages and updater metadata
  are published to the matching GitHub Release.
- [Sync upstream](./.github/workflows/sync-upstream.yml) runs every Monday and
  can also be started from the Actions tab. It merges the original project's
  `master` branch into `chore/sync-upstream` and opens or refreshes a pull
  request for review.

For the sync workflow to open pull requests, enable **Allow GitHub Actions to
create and approve pull requests** under **Settings > Actions > General >
Workflow permissions** in the GitHub repository. The workflows grant write
access only to the release and sync jobs that need it.

The packaged app checks the releases from `RadioactiveCheese/krangled-poe-trade`
because that publisher is configured in `main/electron-builder.yml`.
