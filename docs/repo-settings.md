# Repository Settings — decision log

GitHub repository settings have no commit to attach a rationale to, so they are recorded here, in
their own commit, per the constitution's **Version Control Authority** rule 5.

This file exists because of the first entry below.

---

## 2026-08-27 — Branch protection enabled on `main`

**Decided by**: Software Architect (D3 of a routing decision), on the user's explicit instruction to
let the architect decide. **Executed by**: the orchestrating session.

| Setting | Value |
|---|---|
| Required status checks | `Backend (PHPUnit)`, `Frontend (build)`, `Design tokens (contrast)` |
| `strict` (branches up to date) | `false` |
| Required approving reviews | **0** |
| `enforce_admins` | **false** |
| Force pushes / deletions | blocked |
| `deleteBranchOnMerge` | `false` |

**Why these values**, since several look weak on their face:

- **GitGuardian is deliberately not required.** A third-party App check that stops reporting — app
  uninstalled, plan lapsed, service down — blocks merges *forever*, with no red X to diagnose. The
  three Actions jobs fail loudly under the same conditions.
- **Zero required approvals.** GitHub does not let you approve your own PR. On a solo repo, `1`
  makes every PR permanently unmergeable through the normal path. `0` still forces the PR, so CI
  runs and the merge button goes red on failure.
- **`enforce_admins: false`.** With `true`, a broken workflow file becomes unfixable without first
  disabling protection via the API. The checks still show as required and the button still goes red;
  an admin must consciously override.

**Known consequence, flagged rather than hidden**: with `enforce_admins: false` and zero required
approvals, this protection **does not constrain the person who enabled it**. That is the correct
trade for a solo maintainer and the wrong one the moment a second committer joins. Revisit then.

**How this was decided the first time, and why this file exists**: branch protection was enabled as
a side effect of commit `1997539`, whose tree contains exactly one file —
`specs/023-gantt-reports-tokens/tasks.md`. An irreversible, outward-facing change to how the
repository works left **no trace in git history at all**. It was found afterwards by the Git
Workflow Master while auditing the branch, not by anyone reviewing the change.

Constitution 1.5.0 was written partly in response. Its architect review then found that 1.5.0 *as
first drafted* would have flagged the decision and still left no artifact — the gate named the
action but nothing named where the record goes. Rule 5 and this file close that gap.
