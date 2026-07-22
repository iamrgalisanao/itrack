# Project Management Workspace PRD / v1.2 / Draft / Owner: Product Manager / Date: June 24, 2026

## Executive Summary

This PRD defines the first production-ready release of a Project Management Workspace covering Dashboard, Projects, Tasks, Kanban Board, Gantt Chart, Schedule View, Team Members, Comments, File Attachments, Notifications, and Reports. The feature will help project managers, team members, admins, clients, and department heads understand project status, task ownership, delays, schedules, dependencies, and next actions from one centralized workspace. The v1 release prioritizes visibility, accountability, timely follow-up, schedule awareness, and controlled client collaboration while deferring advanced automation, budget tracking, workload capacity planning, and complex resource forecasting.

## Problem Statement

Project managers cannot easily see which tasks are delayed, who owns them, how work is scheduled, which tasks are dependent on others, and what needs action next. This causes late follow-ups, unclear accountability, missed deadlines, schedule slippage, and reactive project management. Team members also lack a single place to understand assigned priorities and timeline impact, while clients and department heads struggle to get reliable project status without requesting manual updates. Users need a centralized workspace that makes project health, ownership, deadlines, blockers, dependencies, and required actions immediately visible.

## Goals and Success Metrics

### Goals

1. Give project managers a clear view of project progress, overdue tasks, owners, blockers, dependencies, and next actions.
2. Help team members manage assigned tasks, deadlines, comments, files, and updates.
3. Allow project managers to view work across time using Kanban, Calendar, Timeline, and Gantt views.
4. Allow clients to see approved project progress without exposing internal team coordination.
5. Give department heads controlled visibility into projects under their department.
6. Create a scalable foundation for future workload, budget, automation, AI, and advanced reporting features.

### Success Metrics

| Metric                          |                                                                            Target | Measurement Method                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------- |
| Active project status freshness |                          80% of active projects have task statuses updated weekly | Weekly database query measuring active projects with at least one task status update in the last 7 days |
| Overdue follow-up efficiency    |                        Project managers reduce overdue task follow-up time by 30% | Compare the previous 4 full weeks before rollout against weeks 5–8 after rollout                        |
| Overdue task discoverability    |                             90% of users identify overdue tasks within 10 seconds | Moderated usability test with project managers and department heads                                     |
| Dashboard engagement            |              70% of project managers open the dashboard at least 3 times per week | Product analytics event: `dashboard_viewed`                                                             |
| Task ownership completeness     |                           95% of active tasks have an assigned owner and due date | Database validation report across active projects                                                       |
| Gantt adoption                  |        60% of active project managers open the Gantt Chart at least once per week | Product analytics event: `gantt_viewed`                                                                 |
| Schedule completeness           |           90% of active tasks have valid start and due dates when viewed in Gantt | Database validation report for active tasks                                                             |
| Client-safe collaboration       | 100% of client-visible users are restricted from internal-only comments and files | Permission test suite and production audit logs                                                         |

## User Personas Affected

### Project Manager

Owns project delivery, monitors progress, follows up on blockers, manages schedule risk, reviews dependencies, manages team accountability, and reports status to stakeholders.

### Team Member

Completes assigned tasks, updates task status, comments on blockers, and uploads deliverables.

### Admin

Manages users, roles, permissions, project settings, workspace access, and cross-department visibility.

### Client

Views approved project-level summaries, selected task details, client-visible comments, shared files, and project reports.

### Department Head

Reviews project health, delivery risk, overdue work, blockers, timeline status, and team accountability for projects under their department.

## Product Decisions for v1

| Topic                      | v1 Decision                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client visibility          | Clients see project-level summaries by default. Task-level visibility must be explicitly enabled per task, milestone, or project section.                           |
| Internal comments          | Comments shall support visibility types: Internal and Client-visible. Internal comments are not visible to clients.                                                 |
| Notifications              | The system shall support in-app notifications for all relevant events and email notifications only for high-signal events.                                          |
| Schedule and timeline      | The system shall include Calendar, Timeline, and Gantt Chart views.                                                                                                 |
| Gantt scope                | Gantt Chart is included in v1 for schedule visualization, task bars, milestones, and basic dependencies. Advanced critical path and resource leveling are deferred. |
| Project archive permission | Admins and assigned Project Managers can archive projects. Team Members and Clients cannot archive projects.                                                        |
| Overdue follow-up metric   | Follow-up time shall be measured from the exact overdue timestamp, not from notification creation.                                                                  |
| File upload limit          | v1 shall support a maximum file upload size of 100 MB per file.                                                                                                     |
| Project health             | Project health shall be manually selected by the Project Manager, supported by automated warning signals.                                                           |
| Department Head access     | Department Heads can only see projects assigned to their department unless Admin grants expanded access.                                                            |
| Baseline period            | Use the previous 4 full weeks before rollout as baseline, then compare against weeks 5–8 after rollout.                                                             |

## User Stories with Acceptance Criteria

### Story 1: Dashboard Overview

As a Project Manager, I want a dashboard showing project progress, overdue tasks, upcoming deadlines, blockers, schedule risk, and assigned owners, so that I can quickly decide what needs action.

Acceptance Criteria:

1. The system shall display total active projects, completed tasks, overdue tasks, blocked tasks, upcoming deadlines, schedule risk, and project health.
2. The system shall show overdue tasks with task name, project, owner, due date, overdue duration, and current status.
3. The system shall show projects with timeline risk when tasks are overdue, blocked, or dependent tasks are delayed.
4. The system shall allow users to click a dashboard item and open the related project, task, report, or Gantt view.
5. The system shall display empty states when no projects, tasks, overdue items, blockers, or timeline risks exist.
6. The system shall refresh dashboard data after task, project, dependency, or schedule updates.

### Story 2: Project Management

As a Project Manager, I want to create and manage projects, so that related tasks, members, files, comments, schedules, and reports are organized in one workspace.

Acceptance Criteria:

1. The system shall allow authorized users to create, edit, archive, restore, and view projects.
2. The system shall require project name, project owner, department, status, start date, and target end date.
3. The system shall display project progress based on completed tasks versus total active tasks.
4. The system shall support project statuses: Not Started, In Progress, At Risk, Delayed, On Hold, Completed, and Archived.
5. The system shall prevent archived projects from accepting new tasks unless restored.
6. The system shall allow only Admins and assigned Project Managers to archive projects.
7. The system shall require confirmation before archiving a project.
8. The system shall show project schedule range based on project start date, project end date, task start dates, task due dates, and milestones.

### Story 3: Task Management

As a Team Member, I want to view and update my assigned tasks, so that my project manager and team know the current status and schedule impact of my work.

Acceptance Criteria:

1. The system shall allow authorized users to create, edit, assign, comment on, and complete tasks.
2. The system shall support task statuses: Backlog, To Do, In Progress, For Review, Done, and Blocked.
3. The system shall require task title, project, assignee, status, start date, and due date before saving.
4. The system shall record task status history with timestamp and updated-by user.
5. The system shall mark tasks as overdue when the due date/time has passed and status is not Done.
6. The system shall calculate overdue duration from the exact overdue timestamp.
7. The system shall support task priority values: Low, Medium, High, and Critical.
8. The system shall allow tasks to be marked as milestones when they represent major deliverables.

### Story 4: Kanban Board

As a Project Manager, I want a Kanban board grouped by task status, so that I can manage work progress visually.

Acceptance Criteria:

1. The system shall display tasks in columns based on status.
2. The system shall allow drag-and-drop movement between valid status columns.
3. The system shall save the new task status immediately after movement.
4. The system shall display assignee, due date, priority, overdue indicator, and blocked indicator on each task card.
5. The system shall support filtering by assignee, priority, project, department, due date, and status.
6. The system shall provide a non-drag task status update option for accessibility.

### Story 5: Gantt Chart

As a Project Manager, I want a Gantt Chart showing tasks, milestones, dates, and dependencies, so that I can understand schedule sequence, timeline risk, and delivery impact.

Acceptance Criteria:

1. The system shall display project tasks as horizontal bars based on task start date and due date.
2. The system shall display milestones as distinct milestone markers.
3. The system shall display task name, assignee, status, start date, due date, and dependency indicator in the Gantt row.
4. The system shall support day, week, and month zoom levels.
5. The system shall allow users to click a task bar and open the task detail panel.
6. The system shall visually indicate overdue, blocked, completed, and at-risk tasks.
7. The system shall support basic finish-to-start dependencies between tasks.
8. The system shall warn users when a dependency is invalid, circular, or points to an archived task.
9. The system shall update the Gantt Chart when task dates, status, assignee, or dependencies change.
10. The system shall allow filtering by assignee, status, priority, department, milestone, and overdue status.
11. The system shall not automatically reschedule dependent tasks in v1 unless explicitly approved in a future release.
12. The system shall provide a list or table fallback for users who cannot use drag or visual timeline interactions.

### Story 6: Schedule View

As a Department Head, I want a Schedule view with Calendar and Timeline modes, so that I can understand upcoming deliverables and schedule risk.

Acceptance Criteria:

1. The system shall provide a Schedule module with Calendar and Timeline modes.
2. The system shall display tasks and project milestones by due date.
3. The system shall highlight overdue items separately from upcoming items.
4. The system shall allow filtering by project, department, owner, and status.
5. The system shall open task details when a schedule item is selected.
6. The system shall support week and month Calendar modes for v1.
7. The system shall provide a link from Schedule View to the project Gantt Chart.

### Story 7: Comments and Internal Visibility

As a Project Manager, I want comments to support internal-only and client-visible visibility, so that my team can coordinate privately while still collaborating with clients.

Acceptance Criteria:

1. The system shall allow users with task access to add comments.
2. The system shall require each comment to have a visibility value: Internal or Client-visible.
3. The system shall hide Internal comments from Client users.
4. The system shall show commenter name, timestamp, visibility label, and comment body.
5. The system shall allow authorized users to mention other users in comments.
6. The system shall notify mentioned users based on notification rules.

### Story 8: File Attachments

As a Team Member, I want to attach files to tasks and projects, so that deliverables and supporting documents stay connected to the work.

Acceptance Criteria:

1. The system shall support file uploads on tasks and projects.
2. The system shall allow a maximum upload size of 100 MB per file for v1.
3. The system shall support PDF, DOCX, XLSX, PNG, JPG, and ZIP file types.
4. The system shall restrict file access based on project permission and file visibility.
5. The system shall store uploader name, upload timestamp, file name, file type, and file size.
6. The system shall prevent unauthorized direct file access.

### Story 9: Notifications

As a Project Manager, I want notifications for overdue tasks, mentions, assignments, dependency changes, and important updates, so that I can follow up quickly.

Acceptance Criteria:

1. The system shall notify users in-app when they are assigned to a task.
2. The system shall notify assignees and project managers when a task becomes overdue.
3. The system shall notify users when they are mentioned in comments.
4. The system shall notify Project Managers when a dependency becomes invalid or blocked.
5. The system shall support email notifications for high-signal events: task assignment, mention, overdue task, due-soon reminder, dependency risk, and client-visible update.
6. The system shall allow users to mark notifications as read.
7. The system shall not send email notifications for every minor task update in v1.

### Story 10: Reports and Project Health

As a Client or Department Head, I want project reports, so that I can review progress without asking the project manager for manual updates.

Acceptance Criteria:

1. The system shall provide a project status report showing progress, project health, overdue tasks, completed tasks, blocked tasks, dependency risks, and upcoming milestones.
2. The system shall allow Project Managers to manually set project health as On Track, At Risk, Off Track, On Hold, or Completed.
3. The system shall display automated warning signals beside manual health, including overdue task count, blocked task count, and dependency risk count.
4. The system shall allow filtering reports by project, department, date range, owner, and status.
5. The system shall restrict report visibility based on role permissions.
6. The system shall allow export to PDF or CSV.
7. The system shall show report generation timestamp.
8. The system shall include a simplified timeline or milestone summary in exported reports.

### Story 11: Role-Based Access and Department Visibility

As an Admin, I want users to have role-based and department-based access, so that project information is visible only to the right people.

Acceptance Criteria:

1. The system shall support Admin, Project Manager, Team Member, Client, and Department Head roles.
2. The system shall restrict Department Heads to projects assigned to their department by default.
3. The system shall allow Admins to grant expanded cross-department visibility.
4. The system shall restrict Clients to project-level summaries and explicitly shared tasks, comments, files, reports, and milestone views.
5. The system shall prevent Clients from viewing internal-only Gantt details unless a task, milestone, or project section is explicitly shared.
6. The system shall prevent Team Members from accessing projects where they are not assigned unless granted permission.
7. The system shall log permission-sensitive actions for audit purposes.

## Technical Requirements

1. The system shall use role-based access control for Admin, Project Manager, Team Member, Client, and Department Head.
2. The system shall support department-based project access.
3. The system shall maintain relational records for projects, tasks, users, roles, departments, comments, attachments, notifications, reports, dependencies, milestones, and activity history.
4. The system shall log create, update, delete, archive, restore, assignment, status change, date change, dependency change, comment, file upload, permission change, and report export events.
5. The system shall expose API endpoints for dashboard summary, project CRUD, task CRUD, Kanban, Schedule, Gantt Chart, task dependencies, milestones, comments, attachments, notifications, reports, users, roles, and departments.
6. The system shall validate required fields on both frontend and backend.
7. The system shall support pagination, search, sorting, and filtering for task and project lists.
8. The system shall calculate overdue status server-side.
9. The system shall calculate overdue follow-up time from the exact overdue timestamp.
10. The system shall support configurable upload size limits, with v1 default set to 100 MB per file.
11. The system shall store all timestamps using a consistent timezone strategy.
12. The system shall capture product analytics events for dashboard views, task status updates, overdue task views, notifications opened, reports generated, task follow-ups, Gantt views, dependency creation, and dependency warnings.
13. The system shall prevent circular dependencies at API level.
14. The system shall expose Gantt data in a normalized structure containing task id, project id, task title, start date, due date, status, assignee, milestone flag, dependency ids, and visibility state.

## Non-Functional Requirements

### Performance

1. The dashboard shall load within 2 seconds for workspaces with up to 100 projects and 10,000 tasks.
2. Task filtering and Kanban status changes shall complete within 1 second under normal load.
3. Reports shall generate within 5 seconds for a single project with up to 2,000 tasks.
4. Schedule view shall load within 3 seconds for a month containing up to 1,000 visible tasks.
5. Gantt Chart shall load within 3 seconds for a project containing up to 500 visible tasks.
6. Gantt scrolling and zooming shall remain responsive under normal usage.

### Security

1. The system shall enforce role-based permissions on every API request.
2. The system shall enforce department-based access for Department Heads.
3. The system shall prevent Clients from viewing internal-only comments, internal files, internal reports, and internal-only Gantt data.
4. The system shall restrict file access through authenticated and authorized requests.
5. The system shall validate uploaded file type and size before storage.
6. The system shall preserve audit logs for permission-sensitive actions.
7. The system shall validate dependency creation permissions before saving dependencies.

### Accessibility

1. The system shall meet WCAG 2.1 AA standards for contrast, keyboard navigation, labels, and focus states.
2. The Kanban board shall support keyboard-accessible task movement or an equivalent non-drag status update.
3. The Gantt Chart shall provide a table/list fallback for screen reader and keyboard users.
4. The system shall provide text and visual indicators for overdue, blocked, at-risk, dependency risk, and off-track items.
5. The system shall not rely on color alone to communicate project health, task urgency, or dependency status.

### Mobile

1. The dashboard, task list, task detail, comments, files, notifications, reports, and simplified Gantt view shall be usable on mobile screens.
2. Kanban may use a horizontally scrollable layout on mobile.
3. Gantt Chart may use a read-only horizontal timeline on mobile for v1.
4. Reports may be read-only on mobile for v1.
5. File upload from mobile shall support approved file types where allowed by the device.

## Out of Scope

1. Advanced critical path calculations are out of scope for v1.
2. Automatic rescheduling of dependent tasks is out of scope for v1.
3. Resource leveling and workload balancing are out of scope for v1.
4. Baseline schedule comparison is out of scope for v1.
5. Budget tracking, billing, invoices, and cost forecasting are out of scope.
6. Time tracking, timers, and timesheet approval are out of scope.
7. Workflow automation, recurring tasks, and AI summaries are out of scope.
8. Offline mode and native mobile applications are out of scope.
9. External integrations with Slack, Microsoft Teams, Google Calendar, Jira, GitHub, or email sync are out of scope.
10. Advanced client approval workflows are out of scope beyond basic client-visible comments, shared tasks, shared files, shared milestones, and reports.
11. Automatic project health scoring is out of scope for v1. The system shall only show automated warning signals beside manually selected health.
12. File version control is out of scope for v1.
13. Unlimited file uploads and large media storage are out of scope for v1.

## Dependencies

1. User authentication must be available before development completion.
2. Role-based access control must support Admin, Project Manager, Team Member, Client, and Department Head roles.
3. Department records and user-to-department assignment must exist before Department Head visibility can ship.
4. Project, task, dependency, and milestone database schema must be finalized before frontend integration.
5. File storage service must be selected and configured.
6. File upload validation rules must be approved by product, engineering, and security.
7. Notification delivery rules must be approved by product and engineering.
8. Email notification service must be configured before high-signal email notifications can ship.
9. Design system components for cards, tables, filters, modals, badges, empty states, tabs, permission labels, Gantt bars, milestone markers, and dependency indicators must be available.
10. Analytics events must be implemented to measure dashboard usage, status freshness, overdue follow-up time, notification engagement, report generation, Gantt usage, and dependency warnings.
11. Stakeholders must approve client visibility rules, internal comment behavior, department-based access, and Gantt client-sharing behavior.
12. Baseline analytics must be collected for 4 full weeks before measuring overdue follow-up reduction.

## Timeline / Milestones

### Week 1: Discovery and Product Finalization

Finalize role permissions, client visibility, internal comment rules, dashboard layout, project/task/dependency data model, Gantt scope, notification matrix, file upload rules, and report structure.

### Week 2–3: Backend Foundation

Build APIs for projects, tasks, dependencies, milestones, users, departments, roles, comments, attachments, notifications, dashboard summary, Schedule view, Gantt Chart, and reports.

### Week 4–5: Frontend Core Experience

Build Dashboard, Projects, Task Detail, Kanban Board, filters, comments, internal/client-visible labels, file attachments, and role-aware UI states.

### Week 6: Gantt Chart and Schedule View

Build Gantt Chart, dependency visualization, milestone display, Calendar mode, Timeline mode, schedule filters, and task detail linking.

### Week 7: Notifications and Reports

Build in-app notifications, high-signal email notifications, dependency-risk alerts, project health reporting, timeline summary, and PDF/CSV export.

### Week 8: QA, Accessibility, Security Review

Complete regression testing, permission testing, client visibility testing, Gantt dependency testing, file upload testing, mobile responsiveness, accessibility checks, and security review.

### Week 9: Beta Release

Release to selected Project Managers, Team Members, Department Heads, Admins, and limited Client users. Collect analytics, usability feedback, and permission-related issues.

### Week 10: Production Release

Resolve beta issues, finalize documentation, confirm baseline measurement setup, and release to all enabled users.

### Weeks 11–13: Post-Launch Measurement

Monitor dashboard engagement, task status freshness, overdue follow-up behavior, notification performance, Gantt usage, dependency warnings, report usage, and permission-related incidents.

### Weeks 14–17: Success Metric Evaluation

Compare overdue follow-up performance against baseline. Use weeks 5–8 after release as the primary post-release measurement window for the 30% improvement target.

## Open Questions

1. Which stakeholders must approve the final client visibility rules before release?
2. Should Client users be allowed to comment on shared tasks, or should they only view project summaries and reports?
3. Should internal-only comments be editable after posting, or should edits be restricted after a defined time window?
4. Should email notification preferences be user-configurable in v1 or controlled globally?
5. What exact due-soon reminder timing should be used: 24 hours before due date, 48 hours, or configurable by project?
6. Should project health changes require a reason or note from the Project Manager?
7. Should archived projects remain visible in reports by default, or only when the user applies an Archived filter?
8. What is the approved file retention period for uploaded attachments?
9. Should Admins be able to impersonate or preview access as Client and Department Head roles for QA?
10. What minimum number of active projects is required for a workspace to be included in success metric reporting?
11. Should Gantt dependencies be visible to Clients when the related task is shared, or should only milestone-level timeline information be visible?
12. Should Project Managers be allowed to edit task dates directly from the Gantt Chart in v1, or should date edits only happen in task detail?
13. Should dependency warnings trigger email notifications immediately or only appear in-app?
14. Should milestones be created as a separate entity or as a task type?
