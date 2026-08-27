// Gantt timeline colour map — the single source of truth for what colour a task
// bar is and what colour anything drawn on it must be.
//
// Values are TOKEN NAMES, never colours. A hex literal in this file is the
// defect feature 023 removed, reintroduced: the bars used to hard-code eight
// gradient stops, so they did not move when 022 corrected every status token
// and drifted visibly from the rest of the app.
//
// `scripts/verify-contrast.py` parses this file and joins it to the token
// values in index.css. It reads this module rather than the component because
// `getGanttBarStyles` is a switch with fall-through: a regex over that would
// stop matching after any refactor and the check would go quiet.
//
// The pair is the unit. `fill` without its `ink` is half a decision — that is
// how a bar ends up legible as a shape and illegible as a label.

/**
 * Every status the API accepts, plus `pending`, which the client synthesises
 * in getRollupStatus for parent rows. No status may reach a colour through a
 * fallback branch: `backlog`, `for_review` and `blocked` used to do exactly
 * that and came out red, so a task awaiting review looked like a failure.
 */
export const GANTT_STATUS_TOKENS = {
  backlog: { fill: 'muted-foreground', ink: 'background' },
  not_started: { fill: 'muted-foreground', ink: 'background' },
  pending: { fill: 'muted-foreground', ink: 'background' },
  in_progress: { fill: 'info', ink: 'info-foreground' },
  for_review: { fill: 'warning', ink: 'warning-foreground' },
  blocked: { fill: 'destructive', ink: 'destructive-foreground' },
  delayed: { fill: 'destructive', ink: 'destructive-foreground' },
  completed: { fill: 'success', ink: 'success-foreground' },
}

/**
 * The translucent overlay showing percent complete. It sits between the bar and
 * the percentage label, so it — not the bar — is what the label is read against.
 *
 * The token is `foreground`, not white, and that is load-bearing rather than
 * cosmetic: `--foreground` and every `--*-foreground` ink sit on opposite sides
 * of every fill in both themes, so the overlay always pushes the backdrop away
 * from the ink. Label contrast therefore rises monotonically with alpha, which
 * makes the bare bar (alpha 0) the worst case and the alpha itself a free
 * visual choice. Revert this to white and the labels silently fail again.
 */
export const GANTT_PROGRESS_OVERLAY = { token: 'foreground', alpha: 0.20 }

/** Statuses that render no percentage: nothing has started, so there is none. */
export const GANTT_LABEL_SUPPRESSED = ['not_started', 'pending']
