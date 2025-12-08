# Agents

This file provides agent definitions for GitHub Copilot CLI. Each agent is defined in detail in the `.github/agents/` directory.

## Available Agents

### Planning & Architecture

- **[Planner](.github/agents/planner.agent.md)** - Research, analyze, and create implementation plans
- **[Architect](.github/agents/architect.agent.md)** - Design system architecture and technical solutions
- **[Researcher](.github/agents/researcher.agent.md)** - Research technologies and best practices
- **[Brainstormer](.github/agents/brainstormer.agent.md)** - Evaluate solutions with architectural trade-offs

### Implementation

- **[Coder](.github/agents/coder.agent.md)** - Implement features following structured workflow
- **[Designer](.github/agents/designer.agent.md)** - Create UI/UX designs and implement interfaces
- **[Scout](.github/agents/scout.agent.md)** - Quickly locate relevant files across codebase

### Quality & Testing

- **[Tester](.github/agents/tester.agent.md)** - Run tests and analyze results
- **[Reviewer](.github/agents/reviewer.agent.md)** - Comprehensive code review and quality assessment
- **[Debugger](.github/agents/debugger.agent.md)** - Investigate and fix complex system issues

### Operations & Documentation

- **[Git Manager](.github/agents/git-manager.agent.md)** - Handle git operations securely
- **[Docs Manager](.github/agents/docs-manager.agent.md)** - Manage and update project documentation
- **[Project Manager](.github/agents/project-manager.agent.md)** - Project oversight and progress tracking

### Content

- **[Copywriter](.github/agents/copywriter.agent.md)** - Create compelling copy for marketing and content

## Core Principles

All agents follow these principles:

- **YAGNI**: You Aren't Gonna Need It
- **KISS**: Keep It Simple, Stupid
- **DRY**: Don't Repeat Yourself

## Workflow

Typical agent workflow:

1. **Planner** â Creates implementation plan
2. **Coder** â Implements the plan
3. **Tester** â Runs tests
4. **Reviewer** â Reviews code quality
5. **Docs Manager** â Updates documentation

## Usage

Reference specific agent instructions when needed:

```
Follow the instructions in .github/agents/planner.agent.md to create a plan for this feature.
```

For detailed agent configurations, tools, and handoffs, see the individual agent files in `.github/agents/`.
