# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app

ARG VITE_CHAIN_ID
ARG VITE_RPC_URL
ARG VITE_MASP_ADDRESS
ARG VITE_RELAYER_URL
ARG VITE_FMD_URL
ARG VITE_RELAYER_ADDRESS
ARG VITE_TREE_DEPTH
ARG VITE_PROVER_WASM_URL
ARG VITE_PROVER_ZKEY_URL

ENV VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_RPC_URL=$VITE_RPC_URL \
    VITE_MASP_ADDRESS=$VITE_MASP_ADDRESS \
    VITE_RELAYER_URL=$VITE_RELAYER_URL \
    VITE_FMD_URL=$VITE_FMD_URL \
    VITE_RELAYER_ADDRESS=$VITE_RELAYER_ADDRESS \
    VITE_TREE_DEPTH=$VITE_TREE_DEPTH \
    VITE_PROVER_WASM_URL=$VITE_PROVER_WASM_URL \
    VITE_PROVER_ZKEY_URL=$VITE_PROVER_ZKEY_URL

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
