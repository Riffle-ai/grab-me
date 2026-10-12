# Releasing

1. In the PR that changes the package, add a changeset (`pnpm changeset`) describing the change for users.
2. In the same PR, run `pnpm changeset version`: it bumps `package.json` and writes `CHANGELOG.md`. GitHub Actions in the Riffle-ai org cannot open pull requests, so the version PR is made by hand.
3. Merge the PR. `release.yml` runs on `main` and publishes with `pnpm release` through npm trusted publishing (OIDC; no npm token is stored).
4. The trusted publisher is configured with "stage publish": the version is staged, and a maintainer approves it on npmjs.com before it goes live.
