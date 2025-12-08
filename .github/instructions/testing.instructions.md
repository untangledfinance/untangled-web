---
applyTo: '**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/*.test.js,**/*.spec.js,**/test/**/*,**/tests/**/*,**/__tests__/**/*'
---

# Testing Standards

## Test Design

- Write descriptive test names that explain the behavior being tested
- Follow Arrange-Act-Assert pattern
- Test one behavior per test
- Cover edge cases and error scenarios

## Test Quality

- DO NOT ignore failing tests
- DO NOT use mocks/fakes just to pass tests
- Tests should be deterministic
- Avoid testing implementation details

## Coverage

- Aim for meaningful coverage, not percentage
- Cover critical paths thoroughly
- Include error and edge cases
- Test async behavior properly

## Mocking

- Mock external dependencies only
- Use realistic mock data
- Don't mock what you're testing
- Reset mocks between tests
