FROM oven/bun AS bundler
WORKDIR /untangled
COPY package.json .
COPY bun.lock* .
COPY tsconfig.json .
RUN bun install
COPY src/ src/
RUN bun build \
    --target=node \
    --minify-whitespace --minify-syntax \
    --keep-names \
    --outdir=./dist \
    ./src/index.ts

FROM oven/bun:alpine
WORKDIR /untangled
COPY --from=bundler /untangled/dist/ .
ENTRYPOINT [ "bun", "index.js" ]
