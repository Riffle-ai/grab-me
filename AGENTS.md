# AGENTS.md

Working agreement for coding agents in this repository. Releasing is
`RELEASING.md`.

- **A user-facing change adds a changeset (`pnpm changeset`) in the same pull
  request.** User-facing means someone using the package would notice it: a
  new option, a changed snippet, a fix they would feel. Running
  `pnpm changeset version` turns the changesets into `CHANGELOG.md`
  (`RELEASING.md`), which is never edited by hand. Refactors, tests, CI and
  docs-only changes add none.

## Delivery loop

Every change, by every agent (a Mac session, ABS_Bot, any later one): design
first, small slices, one review beside CI (Fable's verdict, accepted by Leo,
30 Oct). In the backend copilot build's first phase, 16 of 34 first-round
review findings were real defects, all 7 High among them, and all 18 Low or
Info were churn that cost a push each; a slice took 3 h 48 min because nine
design decisions were made inside its pull request, while an 11k-line pull
request whose design was settled merged in 9 min.

1. **Design before code.** An open design question (a new option, a changed
   snippet, what the CLI prints) is decided and merged as a docs change
   (`README.md`, a doc of its own) before the code slice starts. A code pull
   request never decides design; a design question met mid-slice stops the
   slice (rule 5).
2. **Small slices.** About 400 changed lines or fewer, tests included; at most
   8 files and 1 new seam (an exported type or option, an enum's value set, a
   CLI command). A registry file is touched by one slice only, never by two at
   once: `package.json`'s `exports`, `pnpm-lock.yaml`.
3. **Before the push, narrow.** Merge `main` in (a merge, not a rebase), then
   `pnpm typecheck`, `pnpm lint`, `pnpm format` and the tests of what changed
   (`pnpm test <path>`), and `pnpm crap` when a source function changed.
   `pnpm e2e` and `pnpm test:prod` stay in CI. CRAP is at most 6 for every
   function in `src/`: `pnpm crap` (`scripts/crap.mjs`) fails above it, and CI
   runs it on every pull request.
4. **One review, beside CI.** Open the pull request as a draft, then one fresh
   reviewer reviews it, security included, against the brief's acceptance
   criteria and safety rules, not an open-ended hunt, while CI runs. Each
   finding carries a severity. A High, or a Medium that is a real defect (it
   would reach a user, a published version or `main`), blocks: it is fixed
   once, with a test that fails without the fix. A Low or Info goes on the
   issue's follow-up list and never triggers a push to the open pull request.
   There is no second review round: the author or the orchestrator reads the
   fix diff. A security judgement pass joins the review only when the slice
   touches what a production build ships, what the page sends to the dev
   route (`./next/route`) or the CLI, input parsing, or the files it reads or
   writes; CI's checks always run.
5. **Stop rules.** 30 min on a slice without a pull request open, a second red
   CI run on one pull request, or any design question: stop and hand back to
   whoever briefed the slice. A pull request never gets a third CI run. A
   Critical finding in the same area twice means a redesign, briefed anew by an
   oracle or senior reviewer, not another patch.
6. **Measure.** Each slice's pull request body records t0 (start), t1 (pull
   request open), t2 (review posted), t3 (CI done), t4 (merged), the red CI runs
   and their class (test, CRAP, lint, flake, infrastructure), and the lines and
   files changed.

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
