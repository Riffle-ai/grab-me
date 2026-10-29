# AGENTS.md

Working agreement for coding agents in this repository. Releasing is
`RELEASING.md`.

- **A user-facing change adds a changeset (`pnpm changeset`) in the same pull
  request.** User-facing means someone using the package would notice it: a
  new option, a changed snippet, a fix they would feel. Running
  `pnpm changeset version` turns the changesets into `CHANGELOG.md`
  (`RELEASING.md`), which is never edited by hand. Refactors, tests, CI and
  docs-only changes add none.

## Linear is the record

Every piece of work whose status matters to another agent or to a person is
logged in Linear, and kept up to date. Linear is the history of decisions and
outcomes: someone starting cold must be able to read there what was decided,
why, and what came of it, without the chat or the session that did it.

- **Status follows the work.** An issue moves to In Progress when its work
  starts, to Done when its PR merges (with the PR linked), and back to Todo or
  Backlog when it is parked. A status that no longer matches the work is fixed
  as soon as it is seen.
- **Decisions are written down.** A decision (what, who made it, why, the date)
  goes on the issue as a comment, including one made in chat, in a review or on
  a status page.
- **Outcomes and findings too.** What shipped, what a review or a check found,
  and anything that blocks the work go on the issue. New follow-up work gets its
  own issue, linked from the one it came from.
- **No work without an issue.** Work another agent or a person may need to
  know about has an issue before it starts. Changing an issue someone else owns
  (its scope, dates or assignee) is asked first, not done.
