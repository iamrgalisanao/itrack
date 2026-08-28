# Repository Settings — decision log

GitHub repository settings have no commit to attach a rationale to, so they are recorded here, in
their own commit, per the constitution's **Version Control Authority** rule 5.

This file exists because of the first entry below.

---

## 2026-08-28 — `Design tokens (cascade)` added to required checks on `main`

**Decided by**: Software Architect, reviewing feature 024 Story 4 before PR. **Approved by**: the
user, explicitly, after the session's permission classifier blocked the write — which is the correct
behaviour for a repository-settings change. **Executed by**: the orchestrating session, immediately
after PR #32 merged. **Status**: APPLIED and verified.

| Required status checks | `Backend (PHPUnit)`, `Frontend (build)`, `Design tokens (contrast)`, **`Design tokens (cascade)`** |
|---|---|
| `strict` | `false` — unchanged |
| `enforce_admins` | `false` — unchanged |

Verified by reading the protection back after the write; no other setting moved.

**The defect.** `SC-009` names the input-token separation fixture as the mechanism proving the 41
control boundaries actually moved. That fixture is `verify-cascade.py` assertion 1b, which runs in
the `Design tokens (cascade)` job — and that job is **not** in the required-checks list:

| Required today | `Backend (PHPUnit)`, `Frontend (build)`, `Design tokens (contrast)` |
|---|---|
| Not required | **`Design tokens (cascade)`** |

So a change reverting `--input` to `#e5e4e7` turns the cascade job red and **merges anyway**. The
one criterion this feature exists to protect is guarded by an advisory check. This is the same shape
as the defects 024 keeps finding: a gate that runs, reports correctly, and constrains nothing.

**The change**, as run (note `PATCH`, not `PUT` — and an explicit `owner/repo`, because the
`:owner/:repo` placeholder returned a 404 on this endpoint):

```bash
gh api -X PATCH repos/iamrgalisanao/itrack/branches/main/protection/required_status_checks \
  -f 'contexts[]=Backend (PHPUnit)' \
  -f 'contexts[]=Frontend (build)' \
  -f 'contexts[]=Design tokens (contrast)' \
  -f 'contexts[]=Design tokens (cascade)'
```

**Reversible**: yes — re-run without the last `contexts[]` line. This is why it is a routine settings
change once approved and not an irreversible one.

**Why it was applied after PR A rather than before it.** Requiring this check protects *future* merges from
reverting `--input`; it does nothing for PR A, whose cascade run is already green. The hole first
becomes exercisable at PR B — the first PR to edit `verify-cascade.py` itself and the token
vocabulary that job measures, i.e. a PR modifying a gate while that gate is advisory. Paired with
T017 in `specs/024-accessibility-remediation/tasks.md` so neither precondition can be quietly
dropped. PR A was deliberately **not** blocked on this, because coupling a code merge to a human
settings approval manufactures pressure to approve it unread — which is exactly how branch
protection came to be enabled as a side effect of an unrelated commit, the incident this file
exists to record.

**Caveat worth knowing before approving**: the cascade job installs Playwright Chromium, so it is the
slowest job in CI and the most likely to fail for infrastructure reasons rather than code reasons.
It already sets `CASCADE_REQUIRED=1`, which makes a missing browser fail loudly instead of skipping
green — that is deliberate and is what makes it worth requiring. The trade is occasional
infrastructure-flake blocking a merge, against the current state where the feature's own success
criterion cannot block anything.

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
