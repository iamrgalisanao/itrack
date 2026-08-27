# Feature Specification: Dark-Mode Contrast for Semantic Status Colours

**Feature Branch**: `022-dark-status-contrast`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "Fix dark-mode contrast for semantic status colors. The .dark block in frontend/src/index.css redeclares --destructive, --success, --warning and --info with the same hex values as light mode, so all four fail WCAG AA on the dark card surface (measured 3.25:1 to 3.48:1 against #1c1d24, below the 4.5:1 threshold for normal text). Components across Bug Tracker, Taskboard, Work Program, Retrospectives, Support Ops and the Dashboard render status text, badges and error messages in these colors, and individual call sites have begun working around it by pairing the semantic colour with a palette override. Adjust the four tokens in the dark block so they clear AA on dark surfaces, remove the ad-hoc call-site workarounds, and prevent regression."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read status information in dark mode (Priority: P1)

As anyone using the app in dark mode, when a task is delayed, a bug is critical, a validation
fails, or an action succeeds, I can read that status text comfortably — the same way I can in
light mode — rather than straining against low-contrast colour on a dark surface.

**Why this priority**: This is the whole feature. Status colour is how the product communicates
urgency; if it is unreadable in one of two supported themes, that communication fails for every
user who prefers dark mode, on every screen that shows status.

**Independent Test**: Switch to dark mode and visit Bug Tracker, Taskboard, Work Program,
Retrospectives, Support Ops and the Dashboard. Measure the contrast of every status-coloured
text element against the surface behind it; each must meet or exceed the AA threshold for its
size. Repeat in light mode to confirm nothing regressed there.

**Acceptance Scenarios**:

1. **Given** the app is in dark mode, **When** a user views any screen showing delayed, error,
   success, warning or informational status text, **Then** that text meets WCAG AA contrast
   against the surface it sits on.
2. **Given** the app is in light mode, **When** the same screens are viewed, **Then** every status
   colour meets AA against every surface it renders on — including a tint of itself — which today
   it does not.
3. **Given** a status colour is used as a background (a filled badge or button) rather than as
   text, **When** it renders in either theme, **Then** the text on top of it still meets AA.

---

### User Story 2 - One place to change a status colour (Priority: P2)

As someone maintaining the interface, when I need to adjust a status colour I change it in the
design tokens and every screen follows, rather than hunting for per-component overrides that
have accumulated because the token was wrong.

**Why this priority**: The ad-hoc overrides are a symptom, not the disease. Left in place they
mask whether the underlying token is correct, and the next person adding a status-coloured
element has to know the workaround exists or reintroduce the bug.

**Independent Test**: Search the frontend for per-component dark-mode colour overrides on status
text. There should be none that exist solely to compensate for a token being wrong; the token
itself should carry the correct value in each theme.

**Acceptance Scenarios**:

1. **Given** the corrected tokens, **When** a component renders status text using the standard
   semantic colour, **Then** it is legible in both themes with no component-level override.
2. **Given** an existing component that carried a workaround override, **When** the override is
   removed, **Then** its appearance in dark mode is unchanged or improved, never worse.

---

### Edge Cases

- Status colour used on a surface other than the standard card (a muted panel, a coloured banner,
  a filled badge) — contrast must hold against that surface too, not only the card.
- Small text: status labels are frequently rendered below normal body size, where the AA
  threshold for large text does not apply.
- A user with a high-contrast or forced-colours OS setting — the fix must not conflict with it.
- Elements that use a status colour as a border or background tint rather than as text.
- Light mode must not regress. It is not frozen: each light colour moves exactly one palette step
  darker to clear AA, and nothing else about it changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All four semantic status colours (destructive, success, warning, informational) MUST
  meet WCAG AA contrast against the surfaces they are rendered on in dark mode.
- **FR-002**: The same four colours MUST meet WCAG AA in light mode as well. All four currently
  fail against at least one surface they render on, so all four MUST be corrected.
- **FR-003**: Each status colour MUST remain recognisable as the same semantic colour in both
  themes — destructive still reads as red, success as green, warning as amber, informational as
  blue. Changing hue to solve contrast is not acceptable.
- **FR-004**: Where a status colour is used as a background, its paired foreground colour MUST
  meet AA against it in both themes.
- **FR-005**: Component-level dark-mode overrides that exist only to compensate for an incorrect
  token MUST be removed, so the token is the single source of truth.
- **FR-006**: The corrected values MUST be verifiable — the contrast ratio of each status colour
  against each surface it is used on MUST be recorded so a future change can be checked against
  it rather than guessed.
- **FR-007**: The change MUST NOT alter which colour communicates which state, or introduce a new
  status colour.

### Key Entities

- **Semantic status colour (existing)**: A named colour representing a state — destructive,
  success, warning, informational — with a paired foreground colour for use as a background.
  Defined once per theme.
- **Surface (existing)**: A background a status colour is rendered against — page, card, muted
  panel. Contrast is a property of the pairing, not of the colour alone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every semantic status colour meets or exceeds the WCAG AA contrast threshold (4.5:1
  for normal text) against every surface it renders on, in both themes. Today eight of eight
  pairings fail: in dark mode all four measure 3.14:1-3.36:1 against the worst-case surface
  (`--muted` `#1f2028`), and in light mode destructive fails as text at 4.34:1 while all four fail
  on a tint of themselves at 3.45:1-3.79:1.
- **SC-002**: Zero component-level dark-mode colour overrides remain whose only purpose is to
  work around an incorrect token. Today there are 4, all pairing a semantic colour with a palette
  override (`text-destructive dark:text-red-400`). Deliberate light/dark pairs on palette colours
  (`text-red-700 dark:text-red-400`) are correct design and are explicitly out of scope.
- **SC-003**: A reviewer can confirm the contrast of any status colour without measuring it by
  hand, because the ratios are recorded alongside the values.
- **SC-004**: Light-mode colours change by exactly one palette step darker each — the correction
  the design system's own AA Floor Rule prescribes — and by nothing else. No hue changes, no
  surface changes, no layout changes.
- **SC-005**: Someone adding a new status-coloured element can use the standard semantic colour
  and be correct in both themes without knowing this history.

## Assumptions

- WCAG AA (4.5:1 for normal text) is the target, consistent with the existing design system's
  stated "AA Floor Rule". AAA is not required.
- The dark card surface is the primary pairing to design against, since it is the most common
  background for status text; other dark surfaces are checked but are lighter or darker variants
  of it rather than independent designs.
- Lightening the existing hues is preferred over selecting new ones, to preserve recognisability
  (FR-003) and match the design system's documented "one step darker/lighter rather than a new
  hue" convention.
- Contrast is verified by calculation against the documented surface colours; automated
  enforcement in the build is out of scope for this change and recorded as a possible follow-up.
- No backend involvement: this is a presentation-layer change with no API, data or permission
  surface.
