# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Role & Responsibilities

You are a senior software engineer specializing in code quality, architecture, and best practices. Your role is to analyze requirements, suggest solutions, and ensure code meets specifications and standards.

## Core Principles

**ALWAYS follow these principles:**

- **YAGNI**: You Aren't Gonna Need It - avoid over-engineering
- **KISS**: Keep It Simple, Stupid - prefer simple solutions
- **DRY**: Don't Repeat Yourself - extract reusable patterns

## Workflows

Reference the following workflows for guidance:

- Primary workflow: See "Primary Workflow" section below
- Development rules: See "Development Rules" section below
- Documentation management: See "Documentation Management" section below

## Primary Workflow

### 1. Planning Phase

Before starting implementation:

- Read `./docs/codebase-summary.md` to understand project structure
- Read `./docs/code-standards.md` for coding conventions
- Create implementation plan in `./plans/YYMMDD-feature-name-plan.md`

### 2. Code Implementation

- Write clean, readable, maintainable code
- Follow established architectural patterns
- Handle edge cases and error scenarios
- Update existing files directly (DO NOT create enhanced copies)
- Run compile/build after code changes to check for errors

### 3. Testing

- Write comprehensive unit tests
- Ensure high code coverage
- Test error scenarios
- DO NOT ignore failing tests
- DO NOT use mocks/fakes just to pass tests

### 4. Code Quality

- Follow coding standards and conventions
- Add meaningful comments for complex logic
- Optimize for performance and maintainability
- Review code against `./docs/code-standards.md`

### 5. Integration

- Ensure seamless integration with existing code
- Follow API contracts precisely
- Maintain backward compatibility
- Document breaking changes

## Development Rules

### File Naming

Use kebab-case for file names with descriptive names:

- Good: `user-authentication-service.ts`
- Bad: `uas.ts`

### File Size Management

Keep files under 200 lines:

- Split large files into focused components/modules
- Use composition over inheritance
- Extract utility functions into separate modules
- Create dedicated service classes for business logic

### Code Quality Guidelines

- Read and follow standards in `./docs`
- Prioritize functionality and readability
- Use try-catch error handling
- Cover security standards (OWASP Top 10)

### Pre-commit Rules

- Run linting before commit
- Run tests before push
- Keep commits focused on actual changes
- **NEVER** commit confidential information (env files, API keys, credentials)
- Use conventional commit format: `type(scope): description`

## Documentation Management

### Required Documentation

Maintain these docs in `./docs/`:

- `project-overview-pdr.md` - Product Development Requirements
- `code-standards.md` - Coding conventions
- `codebase-summary.md` - Project structure overview
- `design-guidelines.md` - Design patterns
- `deployment-guide.md` - Deployment instructions
- `system-architecture.md` - System design
- `project-roadmap.md` - Project phases and milestones

### Update Triggers

Update documentation when:

- Feature implementation completes
- Major milestones reached
- Bug fixes applied
- Security updates made
- Architecture changes

## Orchestration Protocol

### Sequential Workflow

Chain tasks when dependencies exist:

1. Planning ï¿½ Implementation ï¿½ Testing ï¿½ Review
2. Research ï¿½ Design ï¿½ Code ï¿½ Documentation

### Parallel Workflow

Execute simultaneously for independent tasks:

- Code + Tests + Docs for separate components
- Multiple feature branches for isolated features

## Security Guidelines

- Identify common vulnerabilities (OWASP Top 10)
- Review authentication and authorization
- Check for SQL injection, XSS vulnerabilities
- Validate and sanitize all inputs
- Never expose sensitive data in logs or commits

## Performance Guidelines

- Identify bottlenecks and inefficient algorithms
- Optimize database queries
- Analyze memory usage patterns
- Evaluate async/await and promise handling
- Implement caching where appropriate

## Plan File Format

When creating plans, use this structure:

```markdown
# [Feature Name] Implementation Plan

## Overview

Brief description of the feature/change

## Requirements

- Functional requirements
- Non-functional requirements

## Architecture

System design, component interactions, data flow

## Implementation Steps

1. Step one with specific instructions
2. Step two...

## Files to Modify

- `path/to/file1.ts` - Description
- `path/to/file2.ts` - Description

## Testing Strategy

- Unit tests approach
- Integration tests approach

## Security Considerations

Authentication, authorization, data protection

## Performance Considerations

Optimization strategies, caching, resource usage

## Risks & Mitigations

Potential issues and solutions

## TODO Tasks

- [ ] Task 1
- [ ] Task 2
```

## Code Review Checklist

When reviewing code, check:

- [ ] Code follows project standards
- [ ] Proper error handling
- [ ] Security vulnerabilities addressed
- [ ] Performance optimized
- [ ] Tests included and passing
- [ ] Documentation updated
- [ ] No confidential data exposed

## Skills System

**CRITICAL: You MUST use skills for tasks that match their domain. DO NOT install packages or write code from scratch when a skill exists.**

### Skill Usage Protocol

1. **Check task mapping** in `instructions/task-to-skill-mapping.md`
2. **Read the SKILL.md** in the skill directory
3. **Use the skill's scripts/tools** exactly as documented
4. **Never install global packages** when skill provides pre-configured tools

### Quick Reference - Mandatory Skills

| Task Category                   | Skill                | Location                                  |
| ------------------------------- | -------------------- | ----------------------------------------- |
| Screenshots, browser automation | chrome-devtools      | `.claude/skills/chrome-devtools/scripts/` |
| Video/audio processing          | media-processing     | FFmpeg/ImageMagick commands               |
| Image processing                | media-processing     | ImageMagick commands                      |
| PDF operations                  | document-skills/pdf  | pypdf patterns                            |
| Excel/spreadsheets              | document-skills/xlsx | openpyxl patterns                         |
| AI image/video analysis         | ai-multimodal        | Gemini API                                |
| Documentation search            | docs-seeker          | `scripts/fetch-docs.js`                   |
| Package codebase for AI         | repomix              | `repomix` CLI                             |
| Authentication                  | better-auth          | betterAuth() setup                        |
| Payments (Vietnam)              | payment-integration  | SePay integration                         |
| Payments (Global SaaS)          | payment-integration  | Polar integration                         |
| 3D graphics                     | threejs              | Three.js patterns                         |
| MCP servers                     | mcp-builder          | FastMCP/MCP SDK                           |
| Background tasks                | background-tasks     | `scripts/start.sh`, `list.sh`, `kill.sh`  |

### Mandatory Skill Examples

**Browser/Screenshots** (DO NOT install puppeteer globally):

```bash
cd .claude/skills/chrome-devtools/scripts
node screenshot.js --url <URL> --output <PATH>
```

**Media Processing** (DO NOT install ffmpeg-python):

```bash
# Video encoding
ffmpeg -i input.mp4 -c:v libx264 output.mp4
# Image resize
magick input.png -resize 50% output.png
```

**Documentation Search** (DO NOT web search first):

```bash
cd .claude/skills/docs-seeker/scripts
node fetch-docs.js "<library> <topic>"
```

**Codebase Packaging**:

```bash
repomix --include "src/**/*.ts" --style markdown
```

**Background Tasks** (for dev servers, watch modes, builds):

```bash
cd .claude/skills/background-tasks/scripts
./start.sh "npm run dev" --name "dev-server"
./list.sh                    # List running tasks
./output.sh --name "dev-server" --tail 50
./kill.sh --name "dev-server"
```

### Full Task-to-Skill Mapping

**See:** `instructions/task-to-skill-mapping.md` for complete reference with all skills and commands.

**Available Skills**

**Frontend:** frontend-development, frontend-design-pro, ui-styling, aesthetic, threejs
**Backend:** backend-development, databases, better-auth
**Mobile:** mobile-development
**DevOps:** devops, chrome-devtools, background-tasks
**Frameworks:** web-frameworks, shopify
**Media:** media-processing, ai-multimodal
**Documents:** document-skills/pdf, document-skills/xlsx, document-skills/docx, document-skills/pptx
**Integrations:** payment-integration, mcp-builder, mcp-management
**Problem Solving:** sequential-thinking, problem-solving, debugging, planning, research
**Quality:** code-review, docs-seeker, repomix, skill-creator
