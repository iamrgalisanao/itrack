# iTrack P2 PRD — Post-V1 Project Management Roadmap

**Version:** 1.0
**Status:** Draft for Review
**Owner:** Product Management
**Priority:** P2 — High Priority, Post-V1
**Date:** June 26, 2026

---

## Executive Summary

iTrack V1 established the core project management foundation: authenticated access, role-based visibility, projects, tasks, Kanban, schedule views, Gantt baseline, comments, attachments, notifications, reports, audit logs, and client-safe visibility controls. P2 focuses on turning that foundation into a production-grade project execution platform.

The P2 roadmap is organized around three strategic layers:

1. **Foundation and Governance:** Real User Management and Permission Hardening. These features are required before broader rollout because the system has moved from mock authentication to real Sanctum-based authentication. Admins now need a safe way to manage users, roles, departments, client accounts, and project access.
2. **Core Execution Strengthening:** Activity Feed, Project Templates, Gantt Enhancements, and Task Dependencies v2. These features reduce coordination friction, standardize repeatable project delivery, and improve schedule control.
3. **Management and Client Expansion:** Advanced Reports, Workload Planning, Client Portal v2, and Approval Workflow. These features expand iTrack from an internal task-tracking tool into a management, client collaboration, and delivery governance platform.

This PRD covers the next ten planned P2 features in priority order. Each feature includes business rationale, user problems, success metrics, scope, technical considerations, risks, and estimated complexity.

---

# 1. Real User Management

## Overview

Real User Management allows Admins to create, edit, disable, and manage real user accounts after the migration from mock authentication to Sanctum SPA cookie authentication. This is the logical next step because the platform can no longer depend on seeded persona accounts or backend-only user setup.

This feature matters because iTrack cannot scale to real teams, departments, or clients unless Admins can manage user access directly from the UI.

## User Problems It Solves

* Admins cannot add new users without developer or database intervention.
* Users cannot be assigned real roles and departments through the application.
* Former employees or external users cannot be disabled easily.
* Client users cannot be onboarded in a controlled way.
* Role and department changes require manual backend changes.

## Success Metrics

| Metric                              |                                                                           Target | Measurement Method                |
| ----------------------------------- | -------------------------------------------------------------------------------: | --------------------------------- |
| Admin self-service onboarding       |                                90% of new users are created through the Admin UI | Audit logs for `user.created`     |
| Manual backend user setup reduction |                                 80% reduction in developer-created user accounts | Compare pre/post support requests |
| User access accuracy                | 100% of active users have valid role and department configuration where required | User data validation report       |
| Deactivation reliability            |                            100% of disabled users cannot access protected routes | Automated auth/access tests       |

## Key Requirements

### In Scope

* Admin can create users.
* Admin can edit user name, email, role, department, and status.
* Admin can disable or reactivate users.
* Admin can assign one of the five system roles:

  * Admin
  * Project Manager
  * Department Head
  * Team Member
  * Client
* Admin can reset user password or trigger password setup.
* User list supports search, filters, and pagination.
* User actions are audit logged.

### Out of Scope

* Public registration.
* Social login.
* Single sign-on.
* Email verification.
* Self-service password reset, unless needed for launch.
* Complex multi-role users.

## Technical Considerations

* Extends existing `users.role` and `users.department`.
* Requires Admin-only backend endpoints.
* Must not expose password hashes or sensitive auth fields.
* Should use curated user response objects.
* User disabling should invalidate or prevent future sessions.
* Audit log actions:

  * `user.created`
  * `user.updated`
  * `user.disabled`
  * `user.reactivated`
  * `user.password_reset`

## Risks & Mitigations

| Risk                                  | Mitigation                                                    |
| ------------------------------------- | ------------------------------------------------------------- |
| Admin accidentally grants wrong role  | Add confirmation and clear role descriptions                  |
| Disabled users retain active sessions | Check user status on authenticated requests                   |
| Confusing job role vs system role     | Label system role clearly and separate from project/job title |
| Client user sees internal data        | Reuse existing client visibility restrictions and add tests   |

## Estimated Complexity

**Medium**

---

# 2. Permission Hardening

## Overview

Permission Hardening improves access control beyond basic role checks. V1 uses role and department logic, but P2 should introduce project-level access rules, client-specific project access, better 403 handling, and Admin preview tools.

This feature is foundational because every later feature depends on accurate access control.

## User Problems It Solves

* Team Members may see projects beyond their assigned scope.
* Clients need controlled access to specific projects only.
* Department Heads need clear department-based access.
* Admins cannot easily verify what a Client or Department Head can see.
* Access-denied behavior may be inconsistent across pages.

## Success Metrics

| Metric                               |                                                           Target | Measurement Method      |
| ------------------------------------ | ---------------------------------------------------------------: | ----------------------- |
| Unauthorized access incidents        |                     0 known unauthorized data exposure incidents | Audit and QA reports    |
| Permission test coverage             |                 100% of protected modules have role/access tests | Automated test coverage |
| Client visibility accuracy           | 100% of client users see only assigned/shared projects and tasks | Role access tests       |
| Support tickets for access confusion |                       30% reduction after improved 403/access UI | Support ticket tagging  |

## Key Requirements

### In Scope

* Project-level access assignment.
* Client-to-project assignment.
* Team Member-to-project assignment.
* Department Head access by department and grants.
* Admin “Preview as Client” or “Preview as Role.”
* Consistent 403 page and permission-denied messaging.
* Backend enforcement for all access rules.
* Audit logs for permission changes.

### Out of Scope

* Full custom RBAC permission builder.
* Per-field permissions for every model.
* Multi-tenant billing permissions.
* SSO/enterprise directory sync.

## Technical Considerations

* May require new tables:

  * `project_user_access`
  * `client_project_access`
* Existing `Project::accessibleTo(User)` should become the central access gate.
* All report, schedule, Gantt, Kanban, Work Program, comments, attachments, and exports must use shared access logic.
* Permission checks must run before filters.

## Risks & Mitigations

| Risk                                               | Mitigation                                      |
| -------------------------------------------------- | ----------------------------------------------- |
| Access logic duplicated across controllers         | Centralize in scopes/services                   |
| Client sees empty parent sections or hidden counts | Add client-safe hierarchy shaping               |
| Preview mode bypasses real security                | Preview mode must be Admin-only and read-only   |
| Complex access rules slow queries                  | Add indexes and access-scope query optimization |

## Estimated Complexity

**Large**

---

# 3. Activity Feed

## Overview

Activity Feed provides a human-readable history of project and task activity. Unlike audit logs, which are Admin/security-focused, the Activity Feed is a collaboration tool for project teams.

It answers: “What changed since I last checked?”

## User Problems It Solves

* Project Managers do not know what changed across tasks.
* Team Members miss updates unless they inspect each task.
* Stakeholders need a lightweight project timeline.
* Audit logs are too technical for day-to-day collaboration.

## Success Metrics

| Metric                                |                                              Target | Measurement Method                 |
| ------------------------------------- | --------------------------------------------------: | ---------------------------------- |
| Activity feed engagement              |   60% of Project Managers view activity feed weekly | `activity_feed_viewed` analytics   |
| Reduced status clarification comments |           20% reduction in “what changed?” comments | Comment text tagging/sample review |
| Change traceability                   | 95% of key task/project changes generate feed items | Automated event test coverage      |

## Key Requirements

### In Scope

Capture and display events for:

* Task created
* Task status changed
* Task assigned
* Due date changed
* Comment added
* File uploaded
* Project health changed
* Task shared with client
* Approval status changed, once Approval Workflow exists

Feed views:

* Project-level activity feed
* Task-level activity feed
* Global “recent activity” widget

### Out of Scope

* Real-time WebSocket updates.
* AI summaries.
* Editable activity history.
* External integrations.

## Technical Considerations

* Can reuse audit/event logging patterns but should be separate from security audit logs.
* Suggested table:

  * `activity_events`
* Must respect visibility:

  * Clients see only client-visible events.
  * Internal-only comments/files should not appear in client feed.
* Feed should be paginated and newest-first.
* Should be generated from domain events, not frontend-only actions.

## Risks & Mitigations

| Risk                                         | Mitigation                                          |
| -------------------------------------------- | --------------------------------------------------- |
| Feed becomes noisy                           | Group low-value events and filter by event type     |
| Sensitive internal activity leaks to clients | Apply same visibility rules as comments/files/tasks |
| Duplicate event logging                      | Centralize event creation in service layer          |
| Performance issues on large projects         | Paginate and index by project/task/date             |

## Estimated Complexity

**Medium**

---

# 4. Project Templates

## Overview

Project Templates allow teams to create reusable project structures with predefined phases, tasks, milestones, assignees, estimated durations, and default dependencies.

This feature reduces setup time and standardizes delivery for repeatable implementation projects.

## User Problems It Solves

* Project Managers manually recreate the same project structure repeatedly.
* Standard phases are inconsistent across projects.
* New projects miss required tasks or milestones.
* Teams waste time setting up repetitive work.

## Success Metrics

| Metric                       |                                                          Target | Measurement Method                           |
| ---------------------------- | --------------------------------------------------------------: | -------------------------------------------- |
| Project setup time reduction |            50% reduction in average project creation/setup time | Time from project creation to first 20 tasks |
| Template adoption            |                      70% of new projects created from templates | `project_created_from_template` analytics    |
| Task completeness            | 90% of template-created projects contain required milestone set | Template validation report                   |

## Key Requirements

### In Scope

* Create project template from scratch.
* Save existing project as template.
* Create project from template.
* Template includes:

  * Project sections
  * Tasks
  * Milestones
  * Relative dates/durations
  * Default assignee role
  * Default priority
  * Basic dependencies
* Admin/PM can manage templates.
* Templates can be active/inactive.

### Out of Scope

* Marketplace templates.
* Public template sharing.
* Template version branching.
* Cross-organization template library.

## Technical Considerations

* Requires template tables or JSON template definition.
* Prefer normalized template tables if templates need editing:

  * `project_templates`
  * `template_tasks`
  * `template_milestones`
  * `template_dependencies`
* Date handling should use relative offsets:

  * Day 1
  * Day 3
  * Week 2
* Must support mapping template roles to actual users during creation.

## Risks & Mitigations

| Risk                                                   | Mitigation                                          |
| ------------------------------------------------------ | --------------------------------------------------- |
| Templates become too rigid                             | Allow edits after project creation                  |
| Date mapping is confusing                              | Use project start date + relative offsets           |
| Default assignees unavailable                          | Allow role-based placeholders                       |
| Template changes affect existing projects unexpectedly | Template changes should not mutate created projects |

## Estimated Complexity

**Large**

---

# 5. Gantt Enhancements

## Overview

Gantt Enhancements improve the existing V1 Gantt feature from a schedule visualization into an interactive planning tool.

This strengthens schedule management and helps Project Managers understand timeline movement, milestones, and delivery risk.

## User Problems It Solves

* Project Managers cannot easily adjust schedules from the Gantt view.
* Timeline risk is visible but not actionable.
* Dependencies are hard to interpret without visual links.
* Stakeholders need better timeline exports.

## Success Metrics

| Metric                     |                                             Target | Measurement Method                  |
| -------------------------- | -------------------------------------------------: | ----------------------------------- |
| Gantt weekly adoption      |           70% of Project Managers use Gantt weekly | `gantt_viewed` analytics            |
| Schedule update efficiency |             30% reduction in task date update time | Usability test/task completion time |
| Timeline accuracy          | 85% of active tasks have valid start and due dates | Data completeness report            |

## Key Requirements

### In Scope

* Drag task bars to adjust start/end dates.
* Resize task duration.
* Visual dependency lines.
* Milestone markers.
* Zoom levels: day, week, month.
* Highlight overdue, blocked, at-risk, and completed tasks.
* Export Gantt view to print/PDF-friendly format.
* Read-only mobile Gantt.

### Out of Scope

* Advanced resource leveling.
* Automatic critical path in first increment.
* Automatic rescheduling unless explicitly approved.
* Offline Gantt editing.

## Technical Considerations

* Must update task dates through existing task APIs.
* Gantt drag changes should validate permissions.
* Must prevent invalid date ranges.
* Dependency lines depend on Task Dependencies v2.
* Large projects need virtualization or pagination.

## Risks & Mitigations

| Risk                                             | Mitigation                                        |
| ------------------------------------------------ | ------------------------------------------------- |
| Drag-and-drop causes accidental schedule changes | Add undo toast and confirmation for large changes |
| Gantt performance degrades with many tasks       | Virtualized rows and lazy rendering               |
| Mobile usability is poor                         | Provide read-only simplified mobile view          |
| Conflicting dependency dates                     | Show validation warnings before save              |

## Estimated Complexity

**Large**

---

# 6. Task Dependencies v2

## Overview

Task Dependencies v2 expands the basic dependency model into a more complete planning and risk-management capability. It helps teams understand which tasks block others and what downstream work is at risk.

This feature enables more meaningful Gantt enhancements and stronger project risk reporting.

## User Problems It Solves

* Teams cannot clearly see which tasks are blocked by other tasks.
* Delays do not show downstream impact.
* Project Managers manually track dependency risk.
* Reports cannot explain why milestones are slipping.

## Success Metrics

| Metric                          |                                                    Target | Measurement Method              |
| ------------------------------- | --------------------------------------------------------: | ------------------------------- |
| Dependency usage                |        50% of active projects use at least one dependency | Dependency table analytics      |
| Risk detection                  | 90% of overdue predecessor tasks generate dependency risk | Automated dependency-risk tests |
| Reduced manual blocker comments |             20% reduction in manual “blocked by” comments | Comment/event analysis          |

## Key Requirements

### In Scope

* Dependency types:

  * Finish-to-start
  * Start-to-start
  * Finish-to-finish
* Blocked-by relationship.
* Dependency panel on task detail.
* Dependency warnings:

  * Circular dependency
  * Predecessor overdue
  * Predecessor blocked
  * Dependent task starts before predecessor completes
* Gantt dependency visualization.
* Dependency risk count in reports.

### Out of Scope

* Automatic rescheduling by default.
* Full critical path engine in first release.
* Resource-based dependency constraints.
* Cross-project dependencies, unless explicitly approved.

## Technical Considerations

* Existing dependency table may need new fields:

  * `dependency_type`
  * `lag_days`
  * `created_by_user_id`
* Backend must validate circular dependencies.
* Dependency risk should be computed server-side.
* Gantt, Reports, Notifications, and Activity Feed should consume dependency events.

## Risks & Mitigations

| Risk                                 | Mitigation                               |
| ------------------------------------ | ---------------------------------------- |
| Dependency logic becomes too complex | Start with three dependency types only   |
| Circular validation is expensive     | Limit depth and optimize query traversal |
| Users overuse dependencies           | Provide guidance and UX hints            |
| Auto-rescheduling causes distrust    | Keep rescheduling manual in P2           |

## Estimated Complexity

**Large**

---

# 7. Advanced Reports

## Overview

Advanced Reports extend V1 reporting into a management decision-support layer. Reports should help leaders understand project health, overdue work, team performance, client progress, risks, and blockers.

This feature supports executive visibility and operational accountability.

## User Problems It Solves

* Department Heads lack consolidated reporting across projects.
* Project Managers manually prepare status reports.
* Clients need cleaner progress summaries.
* Leadership cannot easily identify risk trends.

## Success Metrics

| Metric                              |                                               Target | Measurement Method           |
| ----------------------------------- | ---------------------------------------------------: | ---------------------------- |
| Report usage                        |      70% of Project Managers generate reports weekly | `report_generated` analytics |
| Manual report preparation reduction | 40% reduction in time spent preparing weekly reports | User survey/time study       |
| Executive visibility                |        80% of Department Heads access reports weekly | Role-based analytics         |

## Key Requirements

### In Scope

Reports:

* Weekly project status report
* Overdue task report
* Risk and blockers report
* Department performance report
* Client progress report
* Team workload summary, once workload data exists

Capabilities:

* Filters by project, department, health, assignee, status, date range
* Export to CSV
* Print / Save as PDF
* Client-safe report mode
* Saved filter presets
* Generated timestamp

### Out of Scope

* Scheduled email reports in first increment.
* BI dashboard embedding.
* Custom report builder.
* Financial/budget reporting.

## Technical Considerations

* Must reuse role-scoped query services.
* Must not expose internal details to Clients.
* Saved report filters may require:

  * `saved_report_views`
* Reports should be generated live in P2, not snapshotted, unless performance requires caching.
* CSV export must use authenticated blob download.

## Risks & Mitigations

| Risk                                | Mitigation                                |
| ----------------------------------- | ----------------------------------------- |
| Reports become slow                 | Add indexes, pagination, optional caching |
| Client reports leak internal data   | Separate client-safe serializer           |
| Metrics differ from dashboard       | Use shared reporting service              |
| Too many report types confuse users | Start with curated report templates       |

## Estimated Complexity

**Medium to Large**

---

# 8. Workload Planning

## Overview

Workload Planning gives Project Managers and Department Heads visibility into team capacity, assigned work, overloaded users, and underutilized resources.

This shifts iTrack from task tracking to delivery planning.

## User Problems It Solves

* Project Managers do not know who is overloaded.
* Delays happen because workload is not visible.
* Team Members receive too many tasks in the same period.
* Department Heads cannot plan staffing across projects.

## Success Metrics

| Metric                          |                                                 Target | Measurement Method           |
| ------------------------------- | -----------------------------------------------------: | ---------------------------- |
| Workload visibility adoption    |       60% of Project Managers use workload view weekly | `workload_viewed` analytics  |
| Overloaded assignment reduction |    25% reduction in users exceeding capacity threshold | Workload calculation reports |
| Better assignment completeness  | 90% of active tasks have assignee and estimated effort | Data completeness report     |

## Key Requirements

### In Scope

* Estimated effort per task.
* User weekly capacity.
* Workload view by user and week.
* Overload indicators.
* Underutilization indicators.
* Department workload summary.
* Filters by project, department, role, user, date range.
* Read-only workload view for Department Heads.

### Out of Scope

* Payroll.
* Timesheet approval.
* Billing calculations.
* Automatic resource assignment.
* Skills-based resource matching.

## Technical Considerations

* Add fields:

  * `tasks.estimated_hours`
  * `users.weekly_capacity_hours`
* Need working days/calendar assumptions.
* Workload should calculate by task date range and effort allocation.
* Must account for task status:

  * Done tasks should not count as future workload.
* Department access must use existing permission scope.

## Risks & Mitigations

| Risk                                   | Mitigation                                                 |
| -------------------------------------- | ---------------------------------------------------------- |
| Effort estimates are missing           | Default unknown effort and show data completeness warnings |
| Workload calculations are disputed     | Make formula visible and simple                            |
| Users treat workload as exact capacity | Label as planning estimate                                 |
| Too much data entry burden             | Allow bulk effort editing and defaults                     |

## Estimated Complexity

**Large**

---

# 9. Client Portal v2

## Overview

Client Portal v2 improves the client-facing experience beyond basic shared task visibility. It provides Clients with a dedicated dashboard for progress, milestones, shared files, reports, approvals, and client-visible communication.

This feature expands iTrack’s value for external project delivery and client trust.

## User Problems It Solves

* Clients need status updates without asking the Project Manager.
* Clients should not see internal team operations.
* Shared milestones, files, and reports are spread across different screens.
* Project Managers spend time preparing manual client updates.

## Success Metrics

| Metric                          |                                                Target | Measurement Method                |
| ------------------------------- | ----------------------------------------------------: | --------------------------------- |
| Client portal adoption          |              60% of active client users log in weekly | Login analytics by Client role    |
| Manual client update reduction  | 30% reduction in manual client status update requests | Support/communication tracking    |
| Client-safe visibility accuracy |    100% of client portal data passes visibility tests | Automated client visibility tests |

## Key Requirements

### In Scope

Client portal dashboard showing:

* Project summary
* Project health
* Shared milestones
* Shared tasks
* Client-visible comments
* Shared files
* Client-safe reports
* Approval requests, once Approval Workflow exists

Client restrictions:

* No internal comments.
* No internal files.
* No internal task counts.
* No internal dependency details.
* No Admin, Kanban, or internal reports.

### Out of Scope

* Client billing portal.
* Public guest links.
* Client self-registration.
* Client-side project creation.
* Full client messaging system.

## Technical Considerations

* Should use existing `client_visible` and visibility fields.
* May require a dedicated client dashboard endpoint.
* Must use separate client-safe serializers.
* Should support multiple clients per project if user management supports it.
* Approval Workflow should plug into Client Portal later.

## Risks & Mitigations

| Risk                                            | Mitigation                                                |
| ----------------------------------------------- | --------------------------------------------------------- |
| Internal data leaks to client                   | Strict backend serializers and tests                      |
| Portal duplicates internal UI too much          | Build client-specific dashboard, not reused admin screens |
| Clients expect edit/comment rights              | Start read-only except approvals                          |
| Multiple client organizations complicate access | Keep project-client assignment explicit                   |

## Estimated Complexity

**Medium to Large**

---

# 10. Approval Workflow

## Overview

Approval Workflow allows deliverables, milestones, files, or tasks to be submitted for review and approved or rejected by authorized users. This supports formal sign-off for client deliverables, UAT, design approval, deployment readiness, and change acceptance.

This feature closes the loop between project execution and stakeholder acceptance.

## User Problems It Solves

* Approvals happen outside the system through chat or email.
* Project Managers lack a clear approval trail.
* Clients approve deliverables informally.
* Revisions and rejection reasons are not tracked.
* Reports cannot show pending approvals.

## Success Metrics

| Metric                          |                                               Target | Measurement Method                       |
| ------------------------------- | ---------------------------------------------------: | ---------------------------------------- |
| Approval traceability           |     95% of submitted approvals have decision history | Approval audit report                    |
| Approval turnaround visibility  |              80% of approval requests have due dates | Data completeness report                 |
| Reduced approval follow-up time | 30% reduction in time to follow up pending approvals | Compare pre/post approval workflow usage |

## Key Requirements

### In Scope

Approval object supports:

* Submit for approval
* Approve
* Reject
* Request revision
* Approval due date
* Approver role/user
* Decision timestamp
* Decision note
* Approval history

Approval targets:

* Task
* Milestone
* File attachment
* Client deliverable

Visibility:

* Internal approvals
* Client-facing approvals

Notifications:

* Approval requested
* Approval approved
* Approval rejected
* Approval overdue

### Out of Scope

* Digital signatures.
* Legal e-signature compliance.
* Multi-step enterprise approval chains in first increment.
* Payment approval.
* Procurement approval.

## Technical Considerations

* New tables:

  * `approval_requests`
  * `approval_decisions`
* Approval must integrate with:

  * Notifications
  * Activity Feed
  * Reports
  * Client Portal
  * Audit Logs
* Permissions:

  * Project Manager can request approval.
  * Assigned approver can approve/reject.
  * Client can approve only client-facing approvals assigned to them.
* Approval state machine should be explicit:

  * Draft
  * Pending
  * Approved
  * Rejected
  * Revision Requested
  * Cancelled

## Risks & Mitigations

| Risk                                       | Mitigation                                       |
| ------------------------------------------ | ------------------------------------------------ |
| Approval rules become too complex          | Start with single-step approval                  |
| Clients approve wrong item                 | Clear approval target and preview                |
| Approval decisions need audit trail        | Store immutable decision history                 |
| Approval blocks task progress unexpectedly | Make blocking behavior configurable per approval |

## Estimated Complexity

**Large**

---

# Cross-Feature Dependencies

| Feature              | Depends On                              | Enables                                        |
| -------------------- | --------------------------------------- | ---------------------------------------------- |
| Real User Management | Real authentication                     | Permission Hardening, Client Portal, Approvals |
| Permission Hardening | Real User Management                    | Safe reporting, client portal, project access  |
| Activity Feed        | Audit/event foundation                  | Better collaboration, approval history         |
| Project Templates    | Stable task/project model               | Faster project setup                           |
| Gantt Enhancements   | Task dates, dependencies                | Better schedule planning                       |
| Task Dependencies v2 | Gantt baseline                          | Dependency risk, advanced reports              |
| Advanced Reports     | Permissions, reports v1, dependencies   | Executive visibility                           |
| Workload Planning    | User management, task estimates         | Capacity management                            |
| Client Portal v2     | Permission hardening, client visibility | Client self-service                            |
| Approval Workflow    | Users, client portal, notifications     | Formal sign-off and delivery governance        |

---

# Suggested Sequencing

## P2A — Governance and Production Readiness

1. Real User Management
2. Permission Hardening
3. Activity Feed

## P2B — Core Delivery Acceleration

4. Project Templates
5. Gantt Enhancements
6. Task Dependencies v2

## P2C — Management and Client Expansion

7. Advanced Reports
8. Workload Planning
9. Client Portal v2
10. Approval Workflow

---

# Overall Risks

| Risk                                 | Impact               | Mitigation                                           |
| ------------------------------------ | -------------------- | ---------------------------------------------------- |
| Too many large features in one phase | Delivery delays      | Split P2 into P2A, P2B, P2C                          |
| Access control bugs                  | Client data exposure | Centralized permission services and automated tests  |
| Reporting inconsistency              | Stakeholder distrust | Use shared reporting service                         |
| Gantt/dependency complexity          | Engineering overrun  | Avoid auto-rescheduling and critical path initially  |
| User adoption friction               | Low feature usage    | Prioritize templates, reports, and better onboarding |

---

# Overall Success Metrics for P2

| Metric                                            |                              Target |
| ------------------------------------------------- | ----------------------------------: |
| Admins can manage users without developer support | 90% of user changes done through UI |
| Project setup time reduced                        |                       50% reduction |
| Project Managers use Gantt or Schedule weekly     |                        70% adoption |
| Reports generated weekly by PMs                   |                        70% adoption |
| Client users log in weekly                        |          60% of active client users |
| Unauthorized access incidents                     |                                   0 |
| Approval requests have decision history           |                                 95% |

---

# Final Recommendation

P2 should begin with **Real User Management** and **Permission Hardening** before expanding into templates, advanced Gantt, reports, workload, client portal, and approvals. These first two features are not just administrative improvements; they are the security and governance foundation that allow the rest of the roadmap to be safely delivered.

The recommended first sprint package is:

1. Real User Management
2. Permission Hardening foundation
3. Activity Feed event model

This creates the stable base for all remaining P2 capabilities.
