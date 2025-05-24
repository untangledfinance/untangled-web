#!/bin/bash

bun install
bun run build
NODE_AUTH_TOKEN=$NPM_TOKEN bun run scripts/publish.ts \
  --name=untangled-web \
  --version=1.0.9-beta-6 \
  --registry=registry.npmjs.org \
  --dryrun
