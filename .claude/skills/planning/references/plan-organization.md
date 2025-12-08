# Plan Creation & Organization

## Directory Structure

### Plan Location

Save plans in `./plans` directory with timestamp and descriptive name.

**Format:** `plans/YYYYMMDD-HHmm-your-plan-name/`

**Example:** `plans/20251101-1505-authentication-and-profile-implementation/`

### File Organization

```
plans/
âââ 20251101-1505-authentication-and-profile-implementation/
    âââ research/
    â   âââ researcher-XX-report.md
    â   âââ ...
â   âââ reports/
â   â   âââ scout-report.md
â   â   âââ researcher-report.md
â   â   âââ ...
â   âââ plan.md                                # Overview access point
â   âââ phase-01-setup-environment.md          # Setup environment
â   âââ phase-02-implement-database.md         # Database models
â   âââ phase-03-implement-api-endpoints.md    # API endpoints
â   âââ phase-04-implement-ui-components.md    # UI components
â   âââ phase-05-implement-authentication.md   # Auth & authorization
â   âââ phase-06-implement-profile.md          # Profile page
â   âââ phase-07-write-tests.md                # Tests
â   âââ phase-08-run-tests.md                  # Test execution
â   âââ phase-09-code-review.md                # Code review
â   âââ phase-10-project-management.md         # Project management
â   âââ phase-11-onboarding.md                 # Onboarding
â   âââ phase-12-final-report.md               # Final report
âââ ...
```

## File Structure

### Overview Plan (plan.md)

- Keep generic and under 80 lines
- List each phase with status/progress
- Link to detailed phase files
- High-level timeline
- Key dependencies

### Phase Files (phase-XX-name.md)

Fully respect the `./docs/development-rules.md` file.
Each phase file should contain:

**Context Links**

- Links to related reports, files, documentation

**Overview**

- Date and priority
- Current status
- Brief description

**Key Insights**

- Important findings from research
- Critical considerations

**Requirements**

- Functional requirements
- Non-functional requirements

**Architecture**

- System design
- Component interactions
- Data flow

**Related Code Files**

- List of files to modify
- List of files to create
- List of files to delete

**Implementation Steps**

- Detailed, numbered steps
- Specific instructions

**Todo List**

- Checkbox list for tracking

**Success Criteria**

- Definition of done
- Validation methods

**Risk Assessment**

- Potential issues
- Mitigation strategies

**Security Considerations**

- Auth/authorization
- Data protection

**Next Steps**

- Dependencies
- Follow-up tasks
