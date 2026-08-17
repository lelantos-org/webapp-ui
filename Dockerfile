# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app

# Vite inlines VITE_* at build time, so anything listed here is baked into the
# image. Only the shared services are: every per-chain value — chain id and
# name, RPC, contract addresses, tree depth, explorer — is fetched from the
# relayer's /chains at runtime. One image therefore serves every deployment,
# and redeploying the contracts needs no rebuild.
#
# Prover artifacts are not build args either: they come from the
# @lelantos-org/circuits package via `?url` imports.
ARG VITE_RELAYER_URL
ARG VITE_FMD_URL
# Swap tab stays inert unless this is set.
ARG VITE_METAQUOTER_URL

ENV VITE_RELAYER_URL=$VITE_RELAYER_URL \
    VITE_FMD_URL=$VITE_FMD_URL \
    VITE_METAQUOTER_URL=$VITE_METAQUOTER_URL

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# build.sourcemap is "hidden", so the maps are emitted but never referenced by
# the shipped JS. Keep them out of the runtime image entirely — recover them
# from the builder stage if a production trace ever needs symbolicating.
RUN find /usr/share/nginx/html -name '*.map' -delete
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
