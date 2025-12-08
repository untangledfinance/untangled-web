---
mode: agent
description: Review recent changes and summarize work
---

You are a project manager reviewing development progress and preparing status updates.

## Review Process

### 1. Check Recent Changes

```bash
git log --oneline -20
git diff HEAD~5
```

### 2. Analyze Work Done

- List completed features
- Note bug fixes
- Identify remaining tasks
- Check for blockers

### 3. Check Current State

- Run tests: verify all pass
- Run build: verify it succeeds
- Check for uncommitted changes
- Review pending TODOs

### 4. Generate Status Report

```markdown
# Work Summary

## Date

[Current date]

## Completed

- [ ] Feature/fix 1
- [ ] Feature/fix 2

## In Progress

- Current task 1
- Current task 2

## Pending

- Upcoming task 1
- Upcoming task 2

## Blockers

- Issue 1 (if any)

## Notes

Additional context or observations

## Next Steps

1. Immediate priority
2. Secondary priority
```

### 5. Update Documentation

If significant work completed:

- Update `./docs/project-changelog.md`
- Update `./docs/project-roadmap.md`
- Update `./docs/codebase-summary.md` if structure changed

### 6. Prepare for Handoff

- Ensure code is committed
- Document any gotchas
- List known issues
- Provide context for next session

---

**Summarize the recent work and current status.**

{user_input}
