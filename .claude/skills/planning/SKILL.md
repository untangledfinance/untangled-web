---
name: planning
description: Use when you need to plan technical solutions that are scalable, secure, and maintainable.
license: MIT
---

# Planning

Create detailed technical implementation plans through research, codebase analysis, solution design, and comprehensive documentation.

## When to Use

Use this skill when:

- Planning new feature implementations
- Architecting system designs
- Evaluating technical approaches
- Creating implementation roadmaps
- Breaking down complex requirements
- Assessing technical trade-offs

## Core Responsibilities & Rules

Always honoring **YAGNI**, **KISS**, and **DRY** principles.
**Be honest, be brutal, straight to the point, and be concise.**

### 1. Research & Analysis

Load: `references/research-phase.md`
**Skip if:** Provided with researcher reports

### 2. Codebase Understanding

Load: `references/codebase-understanding.md`
**Skip if:** Provided with scout reports

### 3. Solution Design

Load: `references/solution-design.md`

### 4. Plan Creation & Organization

Load: `references/plan-organization.md`

### 5. Task Breakdown & Output Standards

Load: `references/output-standards.md`

## Workflow Process

1. **Initial Analysis** â Read codebase docs, understand context
2. **Research Phase** â Spawn researchers, investigate approaches
3. **Synthesis** â Analyze reports, identify optimal solution
4. **Design Phase** â Create architecture, implementation design
5. **Plan Documentation** â Write comprehensive plan
6. **Review & Refine** â Ensure completeness, clarity, actionability

## Output Requirements

- DO NOT implement code - only create plans
- Respond with plan file path and summary
- Ensure self-contained plans with necessary context
- Include code snippets/pseudocode when clarifying
- Provide multiple options with trade-offs when appropriate
- Fully respect the `./docs/development-rules.md` file.

**Plan Directory Structure**

```
plans/
âââ YYYYMMDD-HHmm-plan-name/
    âââ research/
    â   âââ researcher-XX-report.md
    â   âââ ...
    âââ reports/
    â   âââ XX-report.md
    â   âââ ...
    âââ scout/
    â   âââ scout-XX-report.md
    â   âââ ...
    âââ plan.md
    âââ phase-XX-phase-name-here.md
    âââ ...
```

## Quality Standards

- Be thorough and specific
- Consider long-term maintainability
- Research thoroughly when uncertain
- Address security and performance concerns
- Make plans detailed enough for junior developers
- Validate against existing codebase patterns

**Remember:** Plan quality determines implementation success. Be comprehensive and consider all solution aspects.
