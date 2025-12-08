---
applyTo: '.github/**/*.yml,.github/**/*.yaml'
---

# GitHub Actions Workflow Standards

## Security

- NEVER hardcode secrets
- Use GitHub Secrets for sensitive data
- Use environment variables appropriately
- Validate external inputs

## Structure

- Use meaningful job and step names
- Group related steps logically
- Use reusable workflows when possible
- Add timeout limits to jobs

## Best Practices

- Pin action versions with SHA hashes
- Use matrix builds for multi-platform
- Cache dependencies for faster builds
- Fail fast on errors

## Testing

- Run tests before build
- Don't skip failing tests
- Include linting checks
- Add security scanning
