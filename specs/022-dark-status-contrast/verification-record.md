# Verification Record — 022 Dark-Mode Contrast for Semantic Status Colours

Evidence for quickstart.md's gates and the Constitution VIII Definition-of-Done. Recorded at
implementation time against commits `11cfd56` (tokens + `DESIGN.md`) and `85a79c7` (the five
deletions).

## Gate 1 — Contrast calculation

Before (`b00ac23`, baseline captured per T001): **8/8 FAIL**, `CONTRACT VIOLATED`, exit 1.

| theme | state | text | tint | fill |
|---|---|---|---|---|
| light | destructive | 4.34 | 3.45 | 4.83 |
| light | success | 4.51 | 3.72 | 5.02 |
| light | warning | 4.51 | 3.70 | 5.02 |
| light | info | 4.65 | 3.79 | 5.17 |
| dark | destructive | 3.36 | 3.03 | 4.83 |
| dark | success | 3.23 | 2.83 | 5.02 |
| dark | warning | 3.23 | 2.83 | 5.02 |
| dark | info | 3.14 | 2.75 | 5.17 |

After: **8/8 ok**, `CONTRACT HOLDS`, **exit 0**.

| theme | state | text | tint | fill |
|---|---|---|---|---|
| light | destructive | 5.82 | **4.54** | 6.47 |
| light | success | 6.41 | 5.14 | 7.13 |
| light | warning | 6.37 | 5.07 | 7.09 |
| light | info | 6.02 | 4.79 | 6.70 |
| dark | destructive | 5.86 | 4.67 | 6.46 |
| dark | success | 9.30 | 6.78 | 10.26 |
| dark | warning | 9.71 | 6.94 | 10.71 |
| dark | info | 6.38 | 4.92 | 7.03 |

Every measured figure matches data-model.md exactly. The tightest is light destructive on its own
15% tint at 4.539 — passing by 0.039, and recorded as research.md follow-up 5 precisely because it
is thin.

## Gate 2 — Build, lint, backend

| Check | Result |
|---|---|
| `npm run build` | **exit 0** |
| `npm run lint` | **exit 0** — `✖ 1 problem (0 errors, 1 warning)`; the warning is a pre-existing unused eslint-disable in `BugTracker.jsx`, untouched by this change |
| `php artisan test` | **exit 0** — 448 passed, 1846 assertions |

Judged by exit code, not summary text. ESLint's "0 errors and N warnings potentially fixable" line
counts auto-fixable items and hid a real error throughout 021.

## Gate 3 — Browser, both themes

Run against the app on Vite :5178 (chosen over the default because 5174 — where Vite landed when
5173 was occupied — is **not** in `SANCTUM_STATEFUL_DOMAINS`, and an unlisted origin 401s every
request after login rather than failing visibly).

Theme switched with the app's own sidebar control, not by forcing the class. That distinction
mattered: forcing `.dark` on `<html>` without letting React re-render produced ~23 elements
computing to the light theme's `#08060d` on dark surfaces, which looked like a serious pre-existing
bug and was purely an artifact. Using the real control, it vanished.

**Automated contrast sweep of rendered pages** — every leaf text node, foreground measured against
its true composited background walked up the ancestor chain:

| Page | Theme | Failures |
|---|---|---|
| Dashboard | dark | 0 |
| Work Program (Gantt) | dark | 0 |
| Work Program (Gantt) | light | 0 real (1 artifact — see below) |

**Direct contract probe.** Rendered pages under-test the contract: most status colouring in this app
goes through the *palette* class maps (`STATUS_BADGE_CLASSES` and friends), not the semantic
tokens — Bug Tracker, for instance, had only 5 token-class elements and all were inactive `hover:`
states. So the utilities were exercised directly through the real Tailwind pipeline: `text-{state}`,
`bg-{state}/10 text-{state}`, `bg-{state}/15 text-{state}` and `bg-{state} text-{state}-foreground`,
across `bg-background` / `bg-card` / `bg-muted`, in both themes.

**48/48 passed.** Confirmed live: `bg-destructive` renders `rgb(248,113,113)` with
`color: rgb(22,23,29)` — the foreground flip is real, not just declared.

A 12-probe `bg-{state}/90` set read 1.0:1 and was **not** a finding: the bare class does not exist
in the compiled CSS (only the `hover:` variant is generated), so those probes had transparent
backgrounds. Verified by scanning `document.styleSheets` for the rule.

## Gate 4 — The five deletions

| Check | Before | After |
|---|---|---|
| Semantic-token workarounds (`text-{state} dark:text-*`) | 4 | **0** |
| `dark:text-*-400` population | 50 | **46** |

Down exactly 4 — no legitimate light/dark palette pair was deleted. `Schedule.jsx:655`'s dead
`text-white` removed; the sibling `text-white` on the `bg-purple-500` and `bg-emerald-500` branches
left in place.

## T016 — The accepted drift, looked at

plan.md excludes the hard-coded Gantt palette (`WorkProgram.jsx:580-611`) and the Reports
progress-bar colour (`Reports.jsx:239`). Per T016 this was **observed**, not just documented.

**Judgement: tolerable until the follow-up.** The Gantt bars keep `#3b82f6→#2563eb` (blue) and
`#ef4444→#dc2626` (red) while the tokens move to `#60a5fa` and `#f87171`. The drift is a
lightness/saturation step *within the same hue* — the bars read as a deliberate saturated treatment,
not as a different state. FR-003 is not threatened.

**But the exclusion has its own pre-existing AA problem**, found while looking: the "10%" progress
label is small white text on the lighter end of that gradient, `#3b82f6`, which measures **3.42:1**.
This change neither caused nor fixes it — the gradient is untouched — but it is a real failure on a
surface this feature deliberately did not take, and it strengthens the case for research.md
follow-up 4. Recorded rather than quietly left.

## Definition-of-Done Gate (Constitution VIII)

| Item | Status |
|---|---|
| 1. Tests green | **PASS** — Gate 2 above |
| 2. Authorization review | **N/A**, justified: no endpoint, no role check, no data access |
| 3. Tenant-isolation review | **N/A**, justified: no query, no scoping surface |
| 4. OWASP review | **N/A**, justified: no endpoint, auth, upload or data-exposure surface; the diff contains no PHP |
| 5. `code-slop` review | **PASS** — diff touches only the four files plan.md names; the five deletions are pure, with no compensating comment left at any site; the ratio comment sits with the tokens, not scattered across call sites |

N/A items are recorded as N/A with a justification, not skipped.

## Accessibility (T017)

This change *is* the accessibility fix. It introduces no new hard-coded colour and removes one
(`text-white`), so nothing new would survive a `forced-colors` override. The app defines neither
`prefers-contrast: high` nor `forced-colors` handling; that gap is pre-existing and recorded as
research.md follow-up 3.
