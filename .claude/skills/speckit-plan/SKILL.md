---
name: "speckit-plan"
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
argument-hint: "Optional guidance for the planning phase"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
user-invocable: true
disable-model-invocation: false
---


## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Detect actual repository architecture** (before writing Technical Context):
   - Read `backend/composer.json` (and `backend/composer.lock` if present) to determine the actual installed Laravel version — do not assume the version named in the constitution or in prior specs is still current.
   - Read `frontend/package.json` to confirm the actual React/Vite/build-tool versions and whether TypeScript is present (check for `typescript` in dependencies and any `.ts`/`.tsx` files).
   - The plan MUST build on the repository's existing Laravel and React architecture (existing controllers/models/routes conventions, existing frontend routing/state patterns) rather than introducing a parallel structure.
   - **Do not use Laravel-version-specific APIs, syntax, or package features unless the detected installed Laravel version actually supports them.** If Technical Context or research.md is tempted to reference a Laravel 13-only API, verify against the detected version first; if the repo is on an earlier version, use the equivalent API for that version instead.

4. **Apply installed coding-standard skills**: Load and apply the rules from the project's installed skills relevant to this feature's surface:
   - `.claude/skills/php-best-practices` and `.claude/skills/laravel-best-practices` — for any backend PHP/Laravel work
   - `.claude/skills/react-vite-best-practices` — for any frontend React/Vite work
   - `.claude/skills/typescript-react-patterns` — for any frontend work, applied prospectively if the repo is not yet on TypeScript (see Technical Context detection above)
   - `.claude/skills/laravel-testing` — to shape the test-task requirements below
   - `.claude/skills/laravel-owasp-security` — for any endpoint, auth, file-upload, or data-exposure surface
   - `.claude/skills/code-slop` — to shape review/validation expectations, not just implementation style

   Convert the applicable rules from each skill into concrete, feature-specific output in the plan artifacts — not a generic restatement of the skill:
   - **Technical constraints**: add a "Coding-Standard Constraints" subsection under Technical Context in plan.md, listing the specific rules from the applicable skills that bind this feature (e.g., a specific validation pattern, a specific N+1-avoidance rule, a specific typed-props rule).
   - **Test requirements**: research.md and data-model.md/contracts must call out the specific test cases `laravel-testing` and `laravel-owasp-security` imply for this feature's surface (e.g., authorization-denied cases, mass-assignment guards, an OWASP-relevant case such as IDOR/broken access control on a new endpoint) — these feed directly into `/speckit-tasks`' test tasks (Constitution Principle III and VIII).
   - **Validation tasks**: quickstart.md must include the manual/automated validation steps implied by `laravel-owasp-security` and `code-slop` for this feature (e.g., "verify the new endpoint rejects a user without project access", "confirm no unexplained defensive/mock-heavy code was introduced") so they carry forward into `/speckit-tasks` as explicit tasks, satisfying Constitution Principle VIII's Definition-of-Done Gate.

5. **Apply the `frontend-design` and `impeccable` skills for any feature that creates or substantially changes a frontend interface** (Constitution: Frontend Design and Review Governance). This is automatic — the user does not need to ask for it. Before writing Technical Context:
   - Inspect the existing application for comparable pages, shared components, design tokens, typography, spacing, and responsive conventions already in use (`frontend/src/components/ui/`, sibling pages) — identify what's reusable before proposing anything new.
   - Load Impeccable's `shape` reference (`.claude/skills/impeccable/reference/shape.md`) for UX/UI planning, scoped to **Operate** mode (iTrack's surfaces are internal task-completion tools, not marketing/Persuade surfaces) — its planning heuristics apply within, not instead of, the Existing Design System First rule.
   - Determine page purpose, intended users, primary workflow/action, and a deliberate visual direction consistent with the existing product, not a new one.
   - Determine the interface states this feature must account for: loading, empty, error, validation, disabled, success, and permission-denied.
   - Determine responsive behavior (desktop/tablet/mobile) and accessibility/keyboard-interaction requirements.
   - Confirm the proposed design does not introduce a parallel or conflicting design system; if an existing pattern doesn't satisfy the requirements and a new one is genuinely needed, document why.

   Convert this into concrete plan output, not a generic restatement:
   - Add a **"Frontend Design Constraints"** subsection under Technical Context (sibling to "Coding-Standard Constraints" from step 4) naming the specific existing patterns/components this feature reuses, the visual direction, the page/component hierarchy, and which required states apply.
   - quickstart.md must include the responsive and accessibility verification steps implied by this feature's interface, plus a **frontend review pass**: compare the implementation against the spec, this constitution, the plan, and comparable existing pages/components, run `/impeccable audit <target>` and `/impeccable critique <target>` against the implemented surface, and classify any findings (from either the manual comparison or Impeccable's output) as Critical/Major/Minor/Suggestion. Critical/Major findings block completion unless explicitly documented and accepted (Constitution Completion Gate).
   - Skip this step entirely for features with no frontend-interface surface (e.g., a pure backend/API-only change) — do not force a Frontend Design Constraints subsection where there's nothing to design.

6. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION"), including the Coding-Standard Constraints subsection from step 4 and the Frontend Design Constraints subsection from step 5 where applicable
   - Fill Constitution Check section from constitution (Principles VII and VIII apply to every feature touching PHP/Laravel or React/TypeScript code; the Frontend Design and Review Governance section applies to every feature with a frontend-interface surface)
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION, including skill-derived test requirements)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md (including skill-derived validation tasks and the frontend review pass from step 5)
   - Re-evaluate Constitution Check post-design

7. **Mandatory Software Architect verification of the generated artifacts, iterated until resolved**: After the post-design Constitution Check, and before the Completion Report, the orchestrating session MUST dispatch a **Software Architect** subagent (Agent tool, `subagent_type: "Software Architect"`) to independently verify the plan artifacts. This is automatic — the user does not need to ask for it. This gate MUST complete (pass, or reach a documented accepted state) before `/speckit-tasks` or `/speckit-implement` runs against this plan — see the corresponding precondition check in `speckit-implement/SKILL.md`.
   - Give the agent the paths to `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `.specify/memory/constitution.md`, and instruct it to verify exactly two dimensions:
     1. **Alignment** — every functional requirement and acceptance criterion in spec.md is addressed by plan.md, data-model.md, or contracts/; the plan builds on the repository's existing Laravel/React architecture (detected in step 3) rather than a parallel structure; no plan decision contradicts a constitution principle or the justifications recorded in the Constitution Check.
     2. **Concreteness** — no unresolved "NEEDS CLARIFICATION" markers remain; the Coding-Standard Constraints and Frontend Design Constraints subsections name specific rules, components, and files rather than generically citing skills; every research.md decision records a rationale and alternatives considered; quickstart.md validation steps are runnable as written, not aspirational.
   - The agent MUST report a finding list where each finding names the affected artifact/section, a verdict (**Misaligned** or **Vague**), the observed problem, and the recommended correction — or an explicit "aligned and concrete, no findings" verdict.
   - **Iterate — this is a loop, not a single pass**: revise the flagged artifacts, then re-dispatch a fresh Software Architect verification scoped to the changed surface. Repeat revise → re-verify until one of two exits is reached:
     - **Clean exit**: the Software Architect returns "aligned and concrete, no findings."
     - **Impasse exit**: a re-verification round returns the same finding(s) as the prior round with no net progress (i.e., correcting one way surfaces the same or an equivalent issue back), OR a finding is a genuine, justified trade-off rather than an error. In either case, stop iterating and document each remaining finding plus the reason it is accepted directly in plan.md (same exception mechanism as a Constitution Check violation) instead of looping indefinitely.
     - There is no fixed iteration cap short of that — do not stop after one correction pass just because a pass was made; stop because the gate actually resolved or hit a genuine impasse.
   - Completion MUST NOT be reported, and `/speckit-tasks`/`/speckit-implement` MUST NOT be invoked against this plan, while unresolved, undocumented findings remain.
   - **Record the outcome in plan.md itself** (append a `## Software Architect Verification` section) so later commands can check it without re-deriving it: number of iterations run, and final status — either `PASSED (clean)` or `PASSED (accepted exceptions)` with each accepted finding and its rationale listed. This section is what `/speckit-implement`'s precondition check reads.
   - If subagent dispatch is unavailable in the current environment, run the identical checklist as a dedicated inline verification pass, iterating the same way, and note in the plan.md section that verification ran inline — the gate itself is never skipped.

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after Phase 1 design. Report branch, IMPL_PLAN path, generated artifacts, and the Software Architect verification outcome from step 7 (no findings / findings resolved / findings accepted with documented rationale in plan.md).

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Create quickstart validation guide** → `quickstart.md`:
   - Document runnable validation scenarios that prove the feature works end-to-end
   - Include prerequisites, setup commands, test/run commands, and expected outcomes
   - Use links or references to contracts and data model details instead of duplicating them
   - Do not include full implementation code, model/service/controller bodies, migrations, or complete test suites
   - Keep this artifact as a validation/run guide; implementation details belong in `tasks.md` and the implementation phase

**Output**: data-model.md, /contracts/*, quickstart.md

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications
- Build on the repository's existing Laravel and React architecture; do not introduce a parallel structure or a new framework/library without a constitution amendment (Delivery Constraints)
- Do not introduce Laravel-version-specific APIs (e.g., Laravel 13-only syntax) unless the version detected in `backend/composer.json`/`composer.lock` actually supports them
- Every plan touching PHP/Laravel or React/TypeScript code must translate `php-best-practices`, `laravel-best-practices`, `react-vite-best-practices`, `typescript-react-patterns`, `laravel-testing`, `laravel-owasp-security`, and `code-slop` into concrete constraints, test requirements, and validation tasks per step 4 above — not just cite the skill names
- Every plan for a feature with a frontend-interface surface must apply the `frontend-design` and `impeccable` skills per step 5 above automatically, without the user asking — existing design conventions and shared components take priority over new patterns, `impeccable` is scoped to Operate mode, and the plan must not introduce a parallel design system
- Every plan run ends with the Software Architect verification gate (step 7), iterated (revise → re-verify) until a clean pass or a documented impasse — the plan artifacts are not final until verified aligned with spec.md and the constitution, and concrete (no vague placeholders or unresolved clarifications), with the outcome recorded in a `## Software Architect Verification` section in plan.md
- `/speckit-implement` MUST refuse to proceed against a plan.md missing that section or recording anything other than `PASSED` — see its precondition check (step 3a). `/speckit-tasks` has no such check today: task generation from an unverified plan is wasted work, not an unreviewed implementation, because step 3a still stops before any task executes. Whether task generation should also hard-stop is a workflow question worth deciding on its own rather than asserting here.

## Done When

- [ ] Plan workflow executed and design artifacts generated
- [ ] Software Architect verification (step 7) dispatched and iterated to a clean pass or documented impasse, with the outcome recorded in plan.md's `## Software Architect Verification` section
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, generated artifacts, and the verification outcome
