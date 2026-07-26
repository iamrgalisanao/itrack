import { AlertTriangle, ShieldAlert, Copy } from 'lucide-react'

/**
 * Shared chrome for all three copy-only generators (client message
 * templates, freeform draft, troubleshooting packet — 003-templates-
 * prompt-generator). Visually distinct from the surrounding editable issue
 * fields so it reads as a separate "generate → review → copy" tool, not
 * another form section that gets saved with the issue.
 *
 * 010-task-detail-tabs: extracted here (was private to
 * SupportIssueExtraFields.jsx) so both it and ResolutionExtraFields.jsx can
 * share one copy instead of each defining or duplicating it — a pure move,
 * zero behavior change. `hasUnsavedFieldChange` (the sibling helper this
 * component's `dirtyWarning` prop is usually driven by) lives in
 * `@/lib/supportTemplates` instead of here, since a component file may only
 * export components for Fast Refresh to work (`react-refresh/only-export-
 * components`) — see that file for its doc comment.
 */
export function GeneratorPanel({ title, controls, hint, dirtyWarning, text, onTextChange, onCopy, copyStatus, monospace, textareaRows = 4, generatedAt }) {
  // Derived from `title` (always unique per generator instance) rather than a
  // new required prop, so this stays a drop-in id/htmlFor pair without
  // changing the component's API.
  const textareaId = `generator-text-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/3 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-foreground">{title}</p>

      {controls}

      <p className="flex items-start gap-1.5 text-[11px]">
        {dirtyWarning ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
            <span className="font-semibold text-warning">{dirtyWarning}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {hint}
            {text && generatedAt ? ` Generated at ${generatedAt}.` : ''}
          </span>
        )}
      </p>

      {text && (
        <div className="space-y-2">
          <label htmlFor={textareaId} className="text-[11px] font-semibold text-muted-foreground">
            Generated message — editable before copying
          </label>
          <textarea
            id={textareaId}
            rows={textareaRows}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            className={`w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary ${monospace ? 'font-mono text-xs' : 'text-sm'}`}
          />
          <button
            type="button"
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyStatus === 'success' ? 'Copied!' : 'Copy to clipboard'}
          </button>
          {copyStatus === 'error' && (
            <p className="text-xs text-destructive">
              Couldn't copy automatically — select the text above and copy manually.
            </p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80 border-t border-primary/10 pt-2">
        <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
        <span>May contain personal information — handle per the Data Privacy Act of 2012 (RA 10173) before sharing outside this system.</span>
      </p>
    </div>
  )
}
