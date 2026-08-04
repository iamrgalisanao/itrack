# Research: ClickUp List View — Features & Comparison to iTrack Work Program

**Date**: 2026-08-01
**Purpose**: Reference material for evaluating improvements to iTrack's Work Program List view.

## What it is

List View is ClickUp's default, most-used view — every Space/Folder/List gets one automatically. It's a flat or grouped row-based task list, distinct from their Table view (more spreadsheet-like) and Board view (kanban).

## Feature inventory

**Columns / fields**
- Built-in fields (Assignee, Due Date, Priority, Status) plus unlimited **Custom Fields**: dropdown, number, text, date, checkbox, currency, progress (auto-calculated from subtasks/checklists, or manual %), and **formula fields** that compute off other numeric/date fields
- Columns shown/hidden via a "+"/Show-Hide panel; new custom fields created inline from the same panel
- **Column Calculations** — sum/average/range footer on numeric columns (e.g., total time estimate across visible tasks)

**Organizing tasks**
- **Group by**: status (default), assignee, priority, due date, tags, or any custom field — each becomes its own visually separated section, ascending/descending
- **Sort by** any column, including custom fields (private custom fields included); if both grouped and sorted, grouping takes priority, sort applies within each group
- **Filter**: stacked AND/OR conditions (e.g., "due date = yesterday AND assignee = me"), non-destructive (hides, doesn't delete)
- **Task name search** — live filter-as-you-type on title
- **Me Mode** — one-click toggle to show only tasks assigned to whoever is currently viewing (dynamic per-viewer, can be set as the view's default for everyone)

**Subtask handling** — three explicit display modes: *Compact* (nested under parent), *Separate* (subtasks listed as full standalone rows), *Hidden*. Drag-and-drop can convert a task into a subtask or vice versa.

**Row-level interaction**
- Inline editing: click any cell (status, priority, assignee, dates, custom field) to edit without opening the task
- Hover-select checkboxes → **Bulk Action Toolbar**: change status/assignee/tags/dates across many tasks at once, plus 18+ advanced bulk actions (e.g., convert selection to subtasks)
- Quick-add task at the bottom of any group or via a top-right "+ Add Task", no full form required
- Row density/height adjustable (compact vs. comfortable) in some workspace tiers

**Views as saved objects**
- Every List view is itself a saved, shareable, nameable configuration (filters + grouping + sort + columns bundled together) — you can have many different List views over the *same* underlying tasks, autosave or manual-save, pinned/reordered, shareable via public link

**Adjacent but relevant**
- Time estimates settable per-assignee, visible/aggregatable as a column
- Dependencies: a "waiting on" task shows a warning indicator; rescheduling a blocking task offers to cascade-reschedule what depends on it
- Multiple assignees per task (not just one owner)
- Keyboard shortcuts / slash commands for fast task creation (`T` new task, `/assign`, `/due`, etc.)

## How this compares to iTrack's Work Program List view today

| Capability | ClickUp List View | iTrack Work Program (List) |
|---|---|---|
| Hierarchy | Flexible, arbitrary-depth subtasks | Fixed 4-level: Module → Activity → Sub-Activity → Task |
| Grouping | By any field (status/assignee/priority/custom field), user-chosen | Fixed by the hierarchy only — no alternate grouping |
| Sorting | Any column, combinable with grouping | None (list order is structural) |
| Filtering | Multi-condition AND/OR, saved per view | Single Status dropdown + text search |
| Custom fields | Unlimited, typed, formula-capable | None — fixed schema (Responsible, Support, dates, progress, status) |
| Bulk actions | Multi-select + bulk edit toolbar | None — one task at a time |
| Inline editing | Click any cell | Quick-status icon + full edit dialog (two-tier, not per-cell) |
| Saved/multiple views | Yes, unlimited, shareable | One fixed layout per project |
| Assignee model | Multiple assignees per task | Single free-text "Responsible" field |
| Me Mode | Built-in toggle | Not present |
| Dependencies | Warnings + cascade reschedule | Not present (Gantt shows Critical Path but no dependency linking that reschedules) |

## Candidate improvements for Work Program, roughly by effort-to-value

Based on what iTrack already has nearby to build on:

1. **Bulk status/assignee update** — Work Program already has per-task quick-status; a multi-select + bulk action bar is a natural extension and probably the highest-leverage, lowest-risk addition given how many tasks a Module can contain.
2. **Sort within the existing hierarchy** — even just "sort tasks within a Sub-Activity by status/plan date/progress" would help without touching the fixed Module→Activity→Sub-Activity structure.
3. **A "My Tasks" toggle (Me Mode equivalent)** — cheap, and directly useful for Team Members, who mainly care about their own assigned work.
4. **Richer filtering** — add Responsible/Assignee and date-range filters alongside the existing Status filter, still non-destructive.
5. **Custom fields / saved views** are the biggest ClickUp differentiators but also the biggest lift — they'd mean relaxing iTrack's fixed schema, which is a real architecture decision (worth a dedicated conversation, not a quick add).

## Sources

- [Intro to List view – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6310260883351-Intro-to-List-view)
- [Sort tasks in List view – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6310352825751-Sort-tasks-in-List-view)
- [Use grouping in views – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6310202447511-Use-grouping-in-views)
- [Manage tasks with the Bulk Action Toolbar – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6309768265495-Manage-tasks-with-the-Bulk-Action-Toolbar)
- [Intro to Custom Fields – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6303536766231-Intro-to-Custom-Fields)
- [Custom Field types – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6303499162647-Custom-Field-types)
- [Create a Formula Field – ClickUp Help](https://help.clickup.com/hc/en-us/articles/30494683858071-Create-a-Formula-Field)
- [Intro to Me Mode and the assignee sidebar – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6308948062871-Intro-to-Me-Mode-and-the-assignee-sidebar)
- [Use filters to search tasks – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6308875427223-Use-filters-to-search-tasks)
- [Customize List view – ClickUp Help](https://help.clickup.com/hc/en-us/articles/7255389296919-Customize-List-view)
- [ClickUp Views Explained – ProcessDriven](https://processdriven.co/clickup/how-to-use-clickup/clickup-views-explained-clickup-tutorial-for-beginners-on-filters-group-by-sort-by-me-mode/)
- [Set Time Estimates per assignee – ClickUp Help](https://help.clickup.com/hc/en-us/articles/7255524972055-Set-Time-Estimates-per-assignee)
- [Intro to Time Estimates – ClickUp Help](https://help.clickup.com/hc/en-us/articles/6304177391767-Intro-to-Time-Estimates)
