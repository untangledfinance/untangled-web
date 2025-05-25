#!/bin/bash

bun install
bun run build

registry=registry.npmjs.org
name=untangled-web
version=$(bun run scripts/bump.ts --name=$name --registry=$registry)

NODE_AUTH_TOKEN=$NPM_TOKEN bun run scripts/publish.ts \
  --name=$name \
  --version=$version \
  --registry=$registry \
  ${@}
