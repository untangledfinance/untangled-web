# context7.com URL Patterns

## Topic-Specific URLs (Priority #1)

**Pattern:** `https://context7.com/{path}/llms.txt?topic={keyword}`

**When to use:** User asks about specific feature/component

**Examples:**

```
shadcn/ui date picker
â https://context7.com/shadcn-ui/ui/llms.txt?topic=date

Next.js caching
â https://context7.com/vercel/next.js/llms.txt?topic=cache

Better Auth OAuth
â https://context7.com/better-auth/better-auth/llms.txt?topic=oauth

FFmpeg compression
â https://context7.com/websites/ffmpeg_doxygen_8_0/llms.txt?topic=compress
```

**Benefits:** Returns ONLY relevant docs, 10x faster, minimal tokens

## General Library URLs (Priority #2)

**GitHub repos:** `https://context7.com/{org}/{repo}/llms.txt`

**Websites:** `https://context7.com/websites/{normalized-path}/llms.txt`

## Known Repository Mappings

```
next.js â vercel/next.js
nextjs â vercel/next.js
astro â withastro/astro
remix â remix-run/remix
shadcn â shadcn-ui/ui
shadcn/ui â shadcn-ui/ui
better-auth â better-auth/better-auth
```

## Official Site Fallbacks

Use ONLY if context7.com unavailable:

```
Astro: https://docs.astro.build/llms.txt
Next.js: https://nextjs.org/llms.txt
Remix: https://remix.run/llms.txt
SvelteKit: https://kit.svelte.dev/llms.txt
```

## Topic Keyword Normalization

**Rules:**

- Lowercase
- Remove special chars
- Use first word for multi-word topics
- Max 20 chars

**Examples:**

```
"date picker" â "date"
"OAuth" â "oauth"
"Server-Side" â "server"
"caching strategies" â "caching"
```
