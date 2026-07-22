# Support Ops Module Plan

## Goal

Use iTrack as the daily operating system for client support, TSMS troubleshooting, coding work, and AI upskilling.

The module should help prevent missed Viber client follow-ups while keeping investigation work connected to project execution.

## Recommended Direction

Add a dedicated **Support Ops** view to iTrack, but reuse the existing task foundation where possible.

iTrack already has:

- Projects
- Modules
- Activities
- Detailed activities as task records
- Kanban status flow
- Comments
- Attachments
- Notifications
- Role-based access
- Reports and health views

Because of that, Support Ops should not start as a separate standalone app. It should become an operational layer on top of the current task system.

## Why This Fits iTrack

The current `detailed_activities` model already supports much of the workflow:

- `name` for issue title
- `type` for priority or classification
- `description` for client issue details
- `notes` for investigation notes
- `output` for resolution or client-facing result
- `responsible` for owner
- `support` for assisting person/team
- `status` for workflow state
- `plan_start_date` and `plan_end_date` for due dates
- comments for updates
- attachments for screenshots, payloads, logs, or files

The main missing pieces are support-specific fields and a focused view.

## Proposed Support Ops View

Add a new sidebar item:

```text
Support Ops
```

Suggested route:

```text
/support-ops
```

Purpose:

Show only support, client issue, troubleshooting, and learning-related work without mixing everything into the general Kanban board.

## Support Workflow Columns

Use these operational statuses in the Support Ops view:

| Column | Backing Status |
|---|---|
| Intake | backlog |
| Needs Info | blocked |
| Needs TSMS Check | not_started |
| Investigating | in_progress |
| Client Update Due | for_review |
| Resolved | completed |

This avoids changing the core task status system immediately.

## Proposed Fields

Add support-specific metadata to detailed activities.

| Field | Purpose |
|---|---|
| `work_type` | support, bug, feature, learning, admin |
| `client_name` | Client or provider name |
| `tenant_name` | Tenant name or tenant ID |
| `channel` | Viber group/person/source |
| `client_priority` | P1, P2, P3 |
| `last_client_update_at` | Last time client was updated |
| `next_action` | Exact next action |
| `evidence` | Timestamp, payload, screenshot summary, log reference |
| `root_cause` | Cause after investigation |
| `resolution` | Final fix, workaround, or explanation |

## Minimal Database Change

Create a migration that adds nullable support fields to `detailed_activities`.

Suggested fields:

```php
$table->string('work_type')->default('project');
$table->string('client_name')->nullable();
$table->string('tenant_name')->nullable();
$table->string('channel')->nullable();
$table->string('client_priority')->nullable();
$table->timestamp('last_client_update_at')->nullable();
$table->text('next_action')->nullable();
$table->text('evidence')->nullable();
$table->text('root_cause')->nullable();
$table->text('resolution')->nullable();
```

This keeps the first version small and compatible with the existing task model.

## Frontend Changes

### Navigation

Add `Support Ops` to the sidebar and mobile drawer.

Suggested icon:

```text
MessagesSquare
```

### New Page

Create:

```text
frontend/src/pages/SupportOps.jsx
```

The page should include:

- Project selector
- Search
- Filters for client, tenant, priority, work type, and update age
- Support-focused board columns
- Quick issue intake button
- Issue detail modal
- Copyable Codex troubleshooting packet
- Copyable Viber response templates

### Support Issue Card

Each card should show:

- Client
- Tenant
- Priority
- Issue title
- Status
- Last client update age
- Next action
- Owner

Highlight cards where `last_client_update_at` is stale.

Suggested stale rules:

- P1: no update for 1 hour
- P2: no update for 4 hours
- P3: no update for 1 business day

## Backend Changes

Update:

```text
backend/app/Models/DetailedActivity.php
backend/app/Http/Controllers/DetailedActivityController.php
```

Add validation and fillable support for the new fields.

Optional later:

Create a support-specific endpoint:

```text
GET /api/support-ops
```

For the first version, the frontend can reuse existing project/module loading and filter detailed activities by `work_type`.

## Issue Intake Template

Support Ops should provide a quick-create form with these fields:

- Client
- Tenant
- Channel
- Priority
- Issue title
- Timestamp
- Endpoint or workflow
- Expected behavior
- Actual behavior
- Evidence
- Next action

Default values:

```text
work_type: support
status: backlog
progress: 0
client_visible: false
```

## Codex Troubleshooting Packet

The detail modal should generate this copyable prompt:

```text
Client issue:
Tenant:
Provider/client:
Timestamp:
Environment:
Endpoint or workflow:
Request payload/sample:
Error message:
Expected behavior:
Actual behavior:
Screenshots/log snippets:

Please inspect the project and identify:
1. Likely cause
2. Files or modules involved
3. Database/config areas to check
4. Safe fix or workaround
5. Client-facing explanation
6. Tests or verification steps
```

## Viber Templates

Add copy buttons for:

- Acknowledgement
- Intake request
- Investigation started
- Progress update
- Waiting for client
- Root cause found
- Resolved

## AI Upskilling Integration

Use `work_type = learning` for AI upskilling tasks.

Suggested learning task fields:

- Topic
- Video/source
- Key idea
- Small experiment
- Result
- Reusable prompt/tool/checklist created

Learning tasks can appear in Support Ops only if a "Learning" filter is enabled, or they can be shown in a later "Growth" view.

## Phased Implementation

### Phase 1: Support Tracker Inside iTrack

- Add support fields to detailed activities
- Add Support Ops route
- Show support-focused board
- Add stale update highlighting
- Add issue detail modal fields

### Phase 2: Templates and Prompt Generator

- Add copyable Viber templates
- Add copyable Codex troubleshooting packet
- Add client-facing update generator field

### Phase 3: Daily Operating Dashboard

- Add Today view
- Show urgent client issues
- Show stale updates
- Show waiting-for-client issues
- Show today's coding and learning priorities

### Phase 4: Automation

- Daily open issue summary
- Notification when client update is overdue
- Weekly review report
- Repeated issue knowledge base

## Recommended First Build

Start with Phase 1 only.

The first useful version should answer:

1. Which clients need attention today?
2. Which issues are waiting for client details?
3. Which issues need TSMS investigation?
4. Which clients have not received an update recently?
5. What is the next action for each open issue?

Do not build Viber integration yet. Start with manual issue entry from Viber into iTrack, then automate after the workflow is proven.
