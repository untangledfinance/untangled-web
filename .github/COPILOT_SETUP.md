# GitHub Copilot Setup Guide

This guide explains how to use the GitHub Copilot agent instructions in this repository.

## Prerequisites

- GitHub Copilot subscription (Individual, Business, or Enterprise)
- VS Code with GitHub Copilot extension
- GitHub Copilot Chat extension

## File Structure

```
.github/
âââ copilot-instructions.md          # Main instruction file (auto-loaded)
âââ agents/                          # Custom agent definitions
â   âââ planner.agent.md             # Planning agent
â   âââ coder.agent.md               # Implementation agent
â   âââ tester.agent.md              # Testing agent
â   âââ reviewer.agent.md            # Code review agent
â   âââ debugger.agent.md            # Debugging agent
â   âââ docs-manager.agent.md        # Documentation agent
â   âââ architect.agent.md           # System architecture agent
â   âââ researcher.agent.md          # Research agent
â   âââ git-manager.agent.md         # Git operations agent
â   âââ designer.agent.md            # UI/UX design agent
â   âââ brainstormer.agent.md        # Solution evaluation agent
âââ instructions/                    # Path-specific instructions
â   âââ typescript.instructions.md   # TypeScript/JavaScript rules
â   âââ python.instructions.md       # Python rules
â   âââ documentation.instructions.md # Documentation rules
âââ prompts/                         # Reusable prompt files
    âââ plan.prompt.md               # Create implementation plans
    âââ cook.prompt.md               # Implement features step by step
    âââ fix.prompt.md                # Fix issues and bugs
    âââ ... (14 prompt files)

.vscode/
âââ mcp.json.example                 # MCP server configuration
```

## How It Works

### Main Instructions

The `copilot-instructions.md` file is automatically loaded by GitHub Copilot when you work in this repository. It provides:

- Core principles (YAGNI, KISS, DRY)
- Development workflows
- Code quality guidelines
- Security practices

### Path-Specific Instructions

Files in `.github/instructions/` apply to specific file types:

- `typescript.instructions.md` - Applied to `.ts`, `.tsx`, `.js`, `.jsx` files
- `python.instructions.md` - Applied to `.py` files
- `documentation.instructions.md` - Applied to `.md` and `docs/` files

### Custom Agents

Files in `.github/agents/` define specialized AI personas with specific tools and capabilities. Each agent has:

- **name**: Agent identifier
- **description**: What the agent does
- **tools**: Available tools (search, editFiles, runCommand, etc.)
- **model**: AI model to use
- **handoffs**: Workflow transitions to other agents

### Reusable Prompts

Prompt files in `.github/prompts/` can be invoked in Copilot Chat using the `@workspace` participant with file references.

## Using Agents

Custom agents appear in the Copilot Chat agent picker. Select an agent to use its specialized capabilities:

| Agent        | Purpose                     | Key Tools                  |
| ------------ | --------------------------- | -------------------------- |
| Planner      | Create implementation plans | search, readFile, fetch    |
| Coder        | Implement features          | editFiles, runCommand      |
| Tester       | Run and analyze tests       | runCommand, readFile       |
| Reviewer     | Code review                 | search, usages, runCommand |
| Debugger     | Investigate issues          | runCommand, githubRepo     |
| Docs Manager | Update documentation        | editFiles, createFile      |
| Architect    | System design               | fetch, search, usages      |
| Researcher   | Research technologies       | fetch, search              |
| Git Manager  | Git operations              | runCommand                 |
| Designer     | UI/UX design                | editFiles, createFile      |
| Brainstormer | Evaluate solutions          | fetch, search              |

### Agent Handoffs

Agents can hand off to other agents. For example:

- **Planner** â **Coder**: After creating a plan, hand off to implement
- **Coder** â **Tester**: After implementation, hand off to run tests
- **Reviewer** â **Coder**: After review, hand off to fix issues

## Using Prompts

### In VS Code Copilot Chat

1. **Plan a feature:**

   ```
   @workspace /plan I need to implement user authentication with OAuth2
   ```

2. **Implement a feature:**

   ```
   @workspace /cook Add a new API endpoint for user profiles
   ```

3. **Fix an issue:**

   ```
   @workspace /fix The login form doesn't validate email format
   ```

4. **Run tests:**

   ```
   @workspace /test Run the test suite and analyze failures
   ```

5. **Code review:**
   ```
   @workspace /review Check the recent changes for security issues
   ```

### Using Prompt Files Directly

You can reference prompt files directly:

```
@workspace Use .github/prompts/plan.prompt.md to plan implementing a caching layer
```

## Prompt Reference

| Prompt       | Command         | Description                                 |
| ------------ | --------------- | ------------------------------------------- |
| plan         | `/plan`         | Research and create implementation plans    |
| cook         | `/cook`         | Implement features with structured workflow |
| fix          | `/fix`          | Debug and fix issues                        |
| test         | `/test`         | Run tests and analyze results               |
| debug        | `/debug`        | Investigate complex system issues           |
| review       | `/review`       | Comprehensive code review                   |
| git-commit   | `/commit`       | Git staging and commits                     |
| fix-ci       | `/fix-ci`       | Fix CI/CD pipeline failures                 |
| fix-types    | `/fix-types`    | Fix TypeScript type errors                  |
| docs         | `/docs`         | Manage documentation                        |
| watzup       | `/watzup`       | Summarize recent work                       |
| brainstorm   | `/brainstorm`   | Evaluate solution approaches                |
| design       | `/design`       | UI/UX design and implementation             |
| architecture | `/architecture` | System architecture planning                |

## Best Practices

### 1. Always Read First

Before implementing, ensure Copilot has context:

```
@workspace Read ./docs/codebase-summary.md and ./docs/code-standards.md first
```

### 2. Use Plans Directory

Store implementation plans in `./plans/`:

```
./plans/YYMMDD-feature-name-plan.md
```

### 3. Follow Conventional Commits

Use the git-commit prompt for proper commit messages:

- `feat(scope): description`
- `fix(scope): description`
- `docs(scope): description`

### 4. Never Commit Secrets

The instructions emphasize never committing:

- `.env` files
- API keys
- Database credentials
- Private keys

### 5. Maintain Documentation

Keep `./docs/` updated:

- Update after feature completion
- Update after bug fixes
- Update architecture changes

## Comparison with Claude Code

| Claude Code           | GitHub Copilot                        |
| --------------------- | ------------------------------------- |
| `CLAUDE.md`           | `copilot-instructions.md`             |
| `.claude/workflows/`  | Sections in `copilot-instructions.md` |
| `.claude/commands/`   | `.github/prompts/*.prompt.md`         |
| `.opencode/agent/`    | `.github/agents/*.agent.md`           |
| `.claude/.mcp.json`   | `.vscode/mcp.json`                    |
| `.claude/skills/`     | Not directly equivalent               |
| Subagents (Task tool) | Agent handoffs                        |

## Customization

### Adding New Prompts

1. Create `.github/prompts/your-prompt.prompt.md`
2. Add frontmatter:
   ```yaml
   ---
   mode: agent
   description: What this prompt does
   ---
   ```
3. Write the prompt instructions
4. Use `{user_input}` for user's input

### Modifying Instructions

Edit `.github/copilot-instructions.md` to:

- Add project-specific rules
- Update workflows
- Include new guidelines

## MCP Server Support

GitHub Copilot supports MCP (Model Context Protocol) servers for extended capabilities.

### VS Code Configuration

- **Repository-level**: `.vscode/mcp.json` (shared with team)
- **Personal**: VS Code `settings.json` (individual use)

### Copilot CLI Configuration

- **User-level**: `~/.copilot/mcp-config.json` (personal config)
- **Project-level**: `.copilot/mcp-config.json` (use with `--additional-mcp-config`)
- **Inline**: `--additional-mcp-config '{"mcpServers": {...}}'`

### Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"]
    }
  }
}
```

### Example Servers

See `.vscode/mcp.json.example` or `.copilot/mcp-config.json.example`:

- `context7` - Documentation search
- `sequential-thinking` - Structured problem-solving
- `chrome-devtools` - Browser automation

### VS Code Setup

1. Copy `.vscode/mcp.json.example` to `.vscode/mcp.json`
2. Add your API keys where needed
3. Restart VS Code
4. Use MCP tools in Copilot Chat Agent mode

### Copilot CLI Setup

1. Copy `.copilot/mcp-config.json.example` to `~/.copilot/mcp-config.json`
2. Add your API keys
3. Run `copilot` - MCP servers load automatically

Or use project-level config:

```bash
copilot --additional-mcp-config @.copilot/mcp-config.json
```

### CLI MCP Options

```bash
# Add MCP config for session
copilot --additional-mcp-config @path/to/config.json

# Disable built-in GitHub MCP
copilot --disable-builtin-mcps

# Disable specific MCP server
copilot --disable-mcp-server server-name

# Enable all GitHub MCP tools
copilot --enable-all-github-mcp-tools
```

## Limitations

GitHub Copilot differs from Claude Code in these areas:

- No background agents/subagents (uses handoffs instead)
- No hooks system (pre/post tool use)
- Prompts (`.prompt.md`) are VS Code only, not CLI

## Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Custom Instructions](https://docs.github.com/en/copilot/customizing-copilot)
- [Prompt Engineering](https://docs.github.com/en/copilot/using-github-copilot/prompt-engineering-for-github-copilot)
