FROM oven/bun AS bundler
WORKDIR /untangled
COPY package.json .
COPY bun.lock* .
COPY tsconfig.json .
RUN bun install
COPY src/ src/
RUN bunx esbuild \
    --bundle \
    --platform=node \
    --target=es2016 \
    --keep-names \
    --format=cjs \
    --outdir=./dist/ \
    --out-extension:.js=.cjs \
    --external:cpu-features \
    --external:ssh2 \
    --external:bcrypt \
    --external:mongodb \
    --external:mongoose \
    --define:global=globalThis \
    --banner:js="var AsyncIterator = (async function*(){})().constructor; var AsyncIteratorPrototype = AsyncIterator.prototype;" \
    ./src/index.ts

FROM node:22-alpine
WORKDIR /untangled
COPY --from=bundler /untangled/dist/ .
ENTRYPOINT [ "node", "index.cjs" ]
