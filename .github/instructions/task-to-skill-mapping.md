# Task-to-Skill Mapping Reference

**CRITICAL**: Before performing ANY task listed below, you MUST:

1. Read the skill's `SKILL.md` file
2. Use the skill's pre-configured scripts/tools
3. Follow the skill's execution protocol exactly

**DO NOT** install packages globally or write code from scratch when a skill exists.

## Browser & Web Automation

| Task               | Skill           | Command/Action                                                                                |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| Take screenshot    | chrome-devtools | `cd .claude/skills/chrome-devtools/scripts && node screenshot.js --url <URL> --output <PATH>` |
| Visit URL          | chrome-devtools | `node navigate.js --url <URL>`                                                                |
| Web scraping       | chrome-devtools | `node evaluate.js --url <URL> --script "<JS>"` or `node snapshot.js`                          |
| Fill forms         | chrome-devtools | `node fill.js --selector <SEL> --value <VAL>`                                                 |
| Click elements     | chrome-devtools | `node click.js --selector <SEL>`                                                              |
| Monitor console    | chrome-devtools | `node console.js --url <URL> --types error,warn`                                              |
| Network traffic    | chrome-devtools | `node network.js --url <URL>`                                                                 |
| Performance test   | chrome-devtools | `node performance.js --url <URL>`                                                             |
| Browser automation | chrome-devtools | Chain commands with `--close false`                                                           |

## Background Tasks

| Task                  | Skill            | Command/Action                             |
| --------------------- | ---------------- | ------------------------------------------ |
| Start background task | background-tasks | `./start.sh "npm run dev" --name "server"` |
| List running tasks    | background-tasks | `./list.sh` or `./list.sh --all`           |
| Get task output       | background-tasks | `./output.sh --name "server" --tail 50`    |
| Kill task             | background-tasks | `./kill.sh --name "server"`                |
| Kill all tasks        | background-tasks | `./kill.sh --all`                          |
| Stream task output    | background-tasks | `./output.sh --name "server" --follow`     |
| Cleanup old tasks     | background-tasks | `./cleanup.sh --older-than 60`             |

## Media Processing

| Task             | Skill            | Command/Action                                             |
| ---------------- | ---------------- | ---------------------------------------------------------- |
| Video encoding   | media-processing | Use FFmpeg: `ffmpeg -i input.mp4 -c:v libx264 output.mp4`  |
| Audio extraction | media-processing | `ffmpeg -i video.mp4 -vn -acodec copy audio.aac`           |
| Image resize     | media-processing | Use ImageMagick: `magick input.png -resize 50% output.png` |
| Image conversion | media-processing | `magick input.png output.jpg`                              |
| Batch images     | media-processing | `mogrify -resize 800x600 *.jpg`                            |
| Video thumbnails | media-processing | `ffmpeg -i video.mp4 -ss 00:00:05 -vframes 1 thumb.jpg`    |
| GIF creation     | media-processing | `ffmpeg -i video.mp4 -vf "fps=10,scale=320:-1" output.gif` |
| Streaming (HLS)  | media-processing | See skill for HLS/DASH manifest creation                   |

## Document Processing

| Task               | Skill                | Command/Action                     |
| ------------------ | -------------------- | ---------------------------------- |
| Read PDF           | document-skills/pdf  | Use pypdf: `PdfReader("doc.pdf")`  |
| Merge PDFs         | document-skills/pdf  | See SKILL.md for PdfWriter usage   |
| Split PDF          | document-skills/pdf  | Extract pages with pypdf           |
| Fill PDF forms     | document-skills/pdf  | Read `forms.md` in skill directory |
| Read Excel         | document-skills/xlsx | Use openpyxl or pandas             |
| Create spreadsheet | document-skills/xlsx | Follow SKILL.md formatting rules   |
| Excel formulas     | document-skills/xlsx | Zero formula errors required       |
| Read Word doc      | document-skills/docx | Use python-docx                    |
| Create PowerPoint  | document-skills/pptx | Use python-pptx                    |

## AI & Multimodal

| Task             | Skill         | Command/Action                        |
| ---------------- | ------------- | ------------------------------------- |
| Analyze image    | ai-multimodal | Use Gemini API with image input       |
| Transcribe audio | ai-multimodal | Gemini supports up to 9.5hr audio     |
| Video analysis   | ai-multimodal | Frame-level analysis, scene detection |
| Generate image   | ai-multimodal | Text-to-image with Gemini             |
| OCR/text extract | ai-multimodal | Visual Q&A with document image        |
| PDF extraction   | ai-multimodal | Native PDF vision (up to 1000 pages)  |

## Database Operations

| Task                  | Skill     | Command/Action                   |
| --------------------- | --------- | -------------------------------- |
| MongoDB queries       | databases | See `references/mongodb-*.md`    |
| PostgreSQL queries    | databases | See `references/postgresql-*.md` |
| Schema design         | databases | Read selection guide in SKILL.md |
| Index optimization    | databases | Performance tuning references    |
| Migrations            | databases | Follow skill patterns            |
| Aggregation pipelines | databases | MongoDB aggregation reference    |

## Authentication

| Task                   | Skill       | Command/Action                       |
| ---------------------- | ----------- | ------------------------------------ |
| Email/password auth    | better-auth | Setup in `auth.ts` with betterAuth() |
| OAuth (Google, GitHub) | better-auth | Add social providers to config       |
| 2FA/MFA                | better-auth | Enable TOTP/SMS plugins              |
| Passkeys/WebAuthn      | better-auth | Use passkey plugin                   |
| Session management     | better-auth | Built-in session handling            |
| RBAC                   | better-auth | Role-based access control plugin     |

## Payment Integration

| Task                 | Skill               | Command/Action                     |
| -------------------- | ------------------- | ---------------------------------- |
| Vietnamese payments  | payment-integration | Use SePay (VietQR, bank transfers) |
| Global subscriptions | payment-integration | Use Polar (SaaS monetization)      |
| QR code payments     | payment-integration | SePay VietQR generation            |
| Webhook handling     | payment-integration | See webhook references             |
| Usage-based billing  | payment-integration | Polar metering API                 |
| Checkout flow        | payment-integration | Platform-specific checkout         |

## Frontend Development

| Task              | Skill                | Command/Action               |
| ----------------- | -------------------- | ---------------------------- |
| React components  | frontend-development | Follow SKILL.md patterns     |
| Data fetching     | frontend-development | Use `useSuspenseQuery`       |
| Routing           | frontend-development | TanStack Router patterns     |
| Styling           | frontend-development | MUI v7 or separate files     |
| Feature structure | frontend-development | `features/{name}/` directory |
| Performance       | frontend-development | Lazy loading, Suspense       |

## Backend Development

| Task          | Skill               | Command/Action                  |
| ------------- | ------------------- | ------------------------------- |
| API design    | backend-development | REST/GraphQL/gRPC patterns      |
| Security      | backend-development | OWASP Top 10 mitigation         |
| Testing       | backend-development | Unit/integration/E2E strategies |
| CI/CD         | backend-development | Docker, Kubernetes patterns     |
| Microservices | backend-development | Architecture patterns           |
| Performance   | backend-development | Caching, optimization guides    |

## Web Frameworks

| Task               | Skill          | Command/Action                |
| ------------------ | -------------- | ----------------------------- |
| Next.js app        | web-frameworks | App Router, RSC, SSR patterns |
| Monorepo setup     | web-frameworks | Turborepo configuration       |
| Icons              | web-frameworks | RemixIcon (3100+ icons)       |
| Server components  | web-frameworks | Next.js RSC patterns          |
| Build optimization | web-frameworks | Turborepo caching             |

## 3D Graphics

| Task            | Skill   | Command/Action                |
| --------------- | ------- | ----------------------------- |
| 3D scenes       | threejs | Scene, camera, renderer setup |
| Load 3D models  | threejs | GLTF/FBX/OBJ loaders          |
| Animations      | threejs | Animation mixer, clips        |
| Post-processing | threejs | Bloom, SSAO, effects          |
| WebXR/VR        | threejs | VR experience setup           |
| Custom shaders  | threejs | Node materials, TSL           |

## DevOps & Deployment

| Task               | Skill  | Command/Action                 |
| ------------------ | ------ | ------------------------------ |
| Cloudflare Workers | devops | Serverless edge functions      |
| Docker containers  | devops | Containerization patterns      |
| GCP deployment     | devops | Compute Engine, Cloud Run      |
| R2 storage         | devops | S3-compatible object storage   |
| D1 database        | devops | SQLite with global replication |
| CI/CD pipelines    | devops | Multi-platform deployment      |

## Shopify Development

| Task               | Skill   | Command/Action                                                |
| ------------------ | ------- | ------------------------------------------------------------- |
| Shopify app        | shopify | `shopify app init`                                            |
| Checkout extension | shopify | `shopify app generate extension --type checkout_ui_extension` |
| Theme development  | shopify | Liquid templating                                             |
| GraphQL API        | shopify | Admin API queries                                             |
| Webhooks           | shopify | Event handling setup                                          |
| Polaris UI         | shopify | Component library                                             |

## Documentation & Research

| Task                 | Skill       | Command/Action                                 |
| -------------------- | ----------- | ---------------------------------------------- |
| Find documentation   | docs-seeker | Run `node scripts/fetch-docs.js "<query>"`     |
| Library docs         | docs-seeker | `node scripts/detect-topic.js "<lib> <topic>"` |
| Package codebase     | repomix     | `repomix --include "src/**/*.ts"`              |
| AI-friendly snapshot | repomix     | XML/Markdown/JSON output                       |
| Token counting       | repomix     | Built-in token estimation                      |

## Problem Solving

| Task                | Skill               | Command/Action                   |
| ------------------- | ------------------- | -------------------------------- |
| Complex analysis    | sequential-thinking | Multi-step problem decomposition |
| Innovation blocks   | problem-solving     | Collision-zone techniques        |
| Root cause analysis | debugging           | Four-phase debugging process     |
| Technical planning  | planning            | Implementation strategy          |
| Technology research | research            | Scalable solution design         |

## Code Quality

| Task              | Skill       | Command/Action              |
| ----------------- | ----------- | --------------------------- |
| Code review       | code-review | Review practices, feedback  |
| Test failures     | debugging   | Verification protocols      |
| Bug investigation | debugging   | Backward call stack tracing |

## MCP Integration

| Task               | Skill          | Command/Action                     |
| ------------------ | -------------- | ---------------------------------- |
| Build MCP server   | mcp-builder    | Python (FastMCP) or Node (MCP SDK) |
| Manage MCP servers | mcp-management | Discover tools/prompts/resources   |
| MCP tool execution | mcp-management | Execute MCP capabilities           |

## UI Design

| Task                  | Skill               | Command/Action           |
| --------------------- | ------------------- | ------------------------ |
| UI components         | ui-styling          | shadcn/ui + Tailwind CSS |
| Design system         | aesthetic           | BEAUTIFUL principles     |
| Production interfaces | frontend-design-pro | Real photos, no AI slop  |
| Canvas designs        | ui-styling          | Visual design generation |
