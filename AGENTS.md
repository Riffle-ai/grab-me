# AGENTS.md

Working agreement for coding agents in this repository. Releasing is
`RELEASING.md`.

- **A user-facing change adds a changeset (`pnpm changeset`) in the same pull
  request.** User-facing means someone using the package would notice it: a
  new option, a changed snippet, a fix they would feel. Running
  `pnpm changeset version` turns the changesets into `CHANGELOG.md`
  (`RELEASING.md`), which is never edited by hand. Refactors, tests, CI and
  docs-only changes add none.
