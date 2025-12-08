# File Organization

Proper file and directory structure for maintainable, scalable frontend code in the the application.

---

## features/ vs components/ Distinction

### features/ Directory

**Purpose**: Domain-specific features with their own logic, API, and components

**When to use:**

- Feature has multiple related components
- Feature has its own API endpoints
- Feature has domain-specific logic
- Feature has custom hooks/utilities

**Examples:**

- `features/posts/` - Project catalog/post management
- `features/blogs/` - Blog builder and rendering
- `features/auth/` - Authentication flows

**Structure:**

```
features/
  my-feature/
    api/
      myFeatureApi.ts         # API service layer
    components/
      MyFeatureMain.tsx       # Main component
      SubComponents/          # Related components
    hooks/
      useMyFeature.ts         # Custom hooks
      useSuspenseMyFeature.ts # Suspense hooks
    helpers/
      myFeatureHelpers.ts     # Utility functions
    types/
      index.ts                # TypeScript types
    index.ts                  # Public exports
```

### components/ Directory

**Purpose**: Truly reusable components used across multiple features

**When to use:**

- Component is used in 3+ places
- Component is generic (no feature-specific logic)
- Component is a UI primitive or pattern

**Examples:**

- `components/SuspenseLoader/` - Loading wrapper
- `components/CustomAppBar/` - Application header
- `components/ErrorBoundary/` - Error handling
- `components/LoadingOverlay/` - Loading overlay

**Structure:**

```
components/
  SuspenseLoader/
    SuspenseLoader.tsx
    SuspenseLoader.test.tsx
  CustomAppBar/
    CustomAppBar.tsx
    CustomAppBar.test.tsx
```

---

## Feature Directory Structure (Detailed)

### Complete Feature Example

Based on `features/posts/` structure:

```
features/
  posts/
    api/
      postApi.ts              # API service layer (GET, POST, PUT, DELETE)

    components/
      PostTable.tsx           # Main container component
      grids/
        PostDataGrid/
          PostDataGrid.tsx
      drawers/
        ProjectPostDrawer/
          ProjectPostDrawer.tsx
      cells/
        editors/
          TextEditCell.tsx
        renderers/
          DateCell.tsx
      toolbar/
        CustomToolbar.tsx

    hooks/
      usePostQueries.ts       # Regular queries
      useSuspensePost.ts      # Suspense queries
      usePostMutations.ts     # Mutations
      useGridLayout.ts              # Feature-specific hooks

    helpers/
      postHelpers.ts          # Utility functions
      validation.ts                 # Validation logic

    types/
      index.ts                      # TypeScript types/interfaces

    queries/
      postQueries.ts          # Query key factories (optional)

    context/
      PostContext.tsx         # React context (if needed)

    index.ts                        # Public API exports
```

### Subdirectory Guidelines

#### api/ Directory

**Purpose**: Centralized API calls for the feature

**Files:**

- `{feature}Api.ts` - Main API service

**Pattern:**

```typescript
// features/my-feature/api/myFeatureApi.ts
import apiClient from '@/lib/apiClient';

export const myFeatureApi = {
  getItem: async (id: number) => {
    const { data } = await apiClient.get(`/blog/items/${id}`);
    return data;
  },
  createItem: async (payload) => {
    const { data } = await apiClient.post('/blog/items', payload);
    return data;
  },
};
```

#### components/ Directory

**Purpose**: Feature-specific components

**Organization:**

- Flat structure if <5 components
- Subdirectories by responsibility if >5 components

**Examples:**

```
components/
  MyFeatureMain.tsx           # Main component
  MyFeatureHeader.tsx         # Supporting components
  MyFeatureFooter.tsx

  # OR with subdirectories:
  containers/
    MyFeatureContainer.tsx
  presentational/
    MyFeatureDisplay.tsx
  blogs/
    MyFeatureBlog.tsx
```

#### hooks/ Directory

**Purpose**: Custom hooks for the feature

**Naming:**

- `use` prefix (camelCase)
- Descriptive of what they do

**Examples:**

```
hooks/
  useMyFeature.ts               # Main hook
  useSuspenseMyFeature.ts       # Suspense version
  useMyFeatureMutations.ts      # Mutations
  useMyFeatureFilters.ts        # Filters/search
```

#### helpers/ Directory

**Purpose**: Utility functions specific to the feature

**Examples:**

```
helpers/
  myFeatureHelpers.ts           # General utilities
  validation.ts                 # Validation logic
  transblogers.ts               # Data transblogations
  constants.ts                  # Constants
```

#### types/ Directory

**Purpose**: TypeScript types and interfaces

**Files:**

```
types/
  index.ts                      # Main types, exported
  internal.ts                   # Internal types (not exported)
```

---

## Import Aliases (Vite Configuration)

### Available Aliases

From `vite.config.ts` lines 180-185:

| Alias         | Resolves To      | Use For                        |
| ------------- | ---------------- | ------------------------------ |
| `@/`          | `src/`           | Absolute imports from src root |
| `~types`      | `src/types`      | Shared TypeScript types        |
| `~components` | `src/components` | Reusable components            |
| `~features`   | `src/features`   | Feature imports                |

### Usage Examples

```typescript
// â PREFERRED - Use aliases for absolute imports
import { apiClient } from '@/lib/apiClient';
import { SuspenseLoader } from '~components/SuspenseLoader';
import { postApi } from '~features/posts/api/postApi';
import type { User } from '~types/user';

// â AVOID - Relative paths from deep nesting
import { apiClient } from '../../../lib/apiClient';
import { SuspenseLoader } from '../../../components/SuspenseLoader';
```

### When to Use Which Alias

**@/ (General)**:

- Lib utilities: `@/lib/apiClient`
- Hooks: `@/hooks/useAuth`
- Config: `@/config/theme`
- Shared services: `@/services/authService`

**~types (Type Imports)**:

```typescript
import type { Post } from '~types/post';
import type { User, UserRole } from '~types/user';
```

**~components (Reusable Components)**:

```typescript
import { CustomAppBar } from '~components/CustomAppBar';
import { ErrorBoundary } from '~components/ErrorBoundary';
import { SuspenseLoader } from '~components/SuspenseLoader';
```

**~features (Feature Imports)**:

```typescript
import { useAuth } from '~features/auth/hooks/useAuth';
import { postApi } from '~features/posts/api/postApi';
```

---

## File Naming Conventions

### Components

**Pattern**: PascalCase with `.tsx` extension

```
MyComponent.tsx
PostDataGrid.tsx
CustomAppBar.tsx
```

**Avoid:**

- camelCase: `myComponent.tsx` â
- kebab-case: `my-component.tsx` â
- All caps: `MYCOMPONENT.tsx` â

### Hooks

**Pattern**: camelCase with `use` prefix, `.ts` extension

```
useMyFeature.ts
useSuspensePost.ts
useAuth.ts
useGridLayout.ts
```

### API Services

**Pattern**: camelCase with `Api` suffix, `.ts` extension

```
myFeatureApi.ts
postApi.ts
userApi.ts
```

### Helpers/Utilities

**Pattern**: camelCase with descriptive name, `.ts` extension

```
myFeatureHelpers.ts
validation.ts
transblogers.ts
constants.ts
```

### Types

**Pattern**: camelCase, `index.ts` or descriptive name

```
types/index.ts
types/post.ts
types/user.ts
```

---

## When to Create a New Feature

### Create New Feature When:

- Multiple related components (>3)
- Has own API endpoints
- Domain-specific logic
- Will grow over time
- Reused across multiple routes

**Example:** `features/posts/`

- 20+ components
- Own API service
- Complex state management
- Used in multiple routes

### Add to Existing Feature When:

- Related to existing feature
- Shares same API
- Logically grouped
- Extends existing functionality

**Example:** Adding export dialog to posts feature

### Create Reusable Component When:

- Used across 3+ features
- Generic, no domain logic
- Pure presentation
- Shared pattern

**Example:** `components/SuspenseLoader/`

---

## Import Organization

### Import Order (Recommended)

```typescript
// 1. React and React-related
import { useAuth } from '@/hooks/useAuth';
import { useMuiSnackbar } from '@/hooks/useMuiSnackbar';
// 3. Alias imports (@ first, then ~)
import { apiClient } from '@/lib/apiClient';
// 2. Third-party libraries (alphabetical)
import { Box, Button, Grid, Paper } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import React, { useCallback, useMemo, useState } from 'react';
import { lazy } from 'react';
import { SuspenseLoader } from '~components/SuspenseLoader';
import { postApi } from '~features/posts/api/postApi';
// 4. Type imports (grouped)
import type { Post } from '~types/post';
import type { User } from '~types/user';
import { myFeatureHelpers } from '../helpers/myFeatureHelpers';
import { useMyFeature } from '../hooks/useMyFeature';
// 5. Relative imports (same feature)
import { MySubComponent } from './MySubComponent';
```

**Use single quotes** for all imports (project standard)

---

## Public API Pattern

### feature/index.ts

Export public API from feature for clean imports:

```typescript
// features/my-feature/index.ts

// Export main components
export { MyFeatureMain } from './components/MyFeatureMain';
export { MyFeatureHeader } from './components/MyFeatureHeader';

// Export hooks
export { useMyFeature } from './hooks/useMyFeature';
export { useSuspenseMyFeature } from './hooks/useSuspenseMyFeature';

// Export API
export { myFeatureApi } from './api/myFeatureApi';

// Export types
export type { MyFeatureData, MyFeatureConfig } from './types';
```

**Usage:**

```typescript
// â Clean import from feature index
import { MyFeatureMain, useMyFeature } from '~features/my-feature';

// â Avoid deep imports (but OK if needed)
import { MyFeatureMain } from '~features/my-feature/components/MyFeatureMain';
```

---

## Directory Structure Visualization

```
src/
âââ features/                    # Domain-specific features
â   âââ posts/
â   â   âââ api/
â   â   âââ components/
â   â   âââ hooks/
â   â   âââ helpers/
â   â   âââ types/
â   â   âââ index.ts
â   âââ blogs/
â   âââ auth/
â
âââ components/                  # Reusable components
â   âââ SuspenseLoader/
â   âââ CustomAppBar/
â   âââ ErrorBoundary/
â   âââ LoadingOverlay/
â
âââ routes/                      # TanStack Router routes
â   âââ __root.tsx
â   âââ index.tsx
â   âââ project-catalog/
â   â   âââ index.tsx
â   â   âââ create/
â   âââ blogs/
â
âââ hooks/                       # Shared hooks
â   âââ useAuth.ts
â   âââ useMuiSnackbar.ts
â   âââ useDebounce.ts
â
âââ lib/                         # Shared utilities
â   âââ apiClient.ts
â   âââ utils.ts
â
âââ types/                       # Shared TypeScript types
â   âââ user.ts
â   âââ post.ts
â   âââ common.ts
â
âââ config/                      # Configuration
â   âââ theme.ts
â
âââ App.tsx                      # Root component
```

---

## Summary

**Key Principles:**

1. **features/** for domain-specific code
2. **components/** for truly reusable UI
3. Use subdirectories: api/, components/, hooks/, helpers/, types/
4. Import aliases for clean imports (@/, ~types, ~components, ~features)
5. Consistent naming: PascalCase components, camelCase utilities
6. Export public API from feature index.ts

**See Also:**

- [component-patterns.md](component-patterns.md) - Component structure
- [data-fetching.md](data-fetching.md) - API service patterns
- [complete-examples.md](complete-examples.md) - Full feature example
