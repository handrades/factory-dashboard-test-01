This  command automatically syncs your current todo list with an external `todo.md` file. It keeps track of all TodoWrite tool calls and maintains a persistent record of tasks across sessions

## Instructions

When this command is executed:

1. **Read the current todo list** fromm the active session
2. **Create or update** a `todo.md` file in the project root
3. **Format teh todos** in a readable markdown format with:
  - Task status (pending, in_progress, completed)
  - Priority level (high, medium, low)
  - Task content
  - Timestamp of last update
4. **Maintain sync** by:
  - Preserving completed tasks for reference
  - Updating task statuses when they change
  - Adding new tasks as they're created
  - Removing tasks taht are no longer relevant

## Output format

The `todo.md` file should be structured as:

```markdown
# Project todo list

Last updated: <date and time goes here>

## In progress
- [ ] some description (priority: medium)

## Pending
- [ ] some description (priority: low)
- [ ] some description (priority: high)

## Completed
- [x] some description (priority: medium)
- [x] some description (priority: low)
- [x] some description (priority: high)
```