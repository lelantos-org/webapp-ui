# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app

# Vite inlines VITE_* at build time, so every runtime setting must be a
# build arg. Prover artifacts are not among them: they come from the
# @lelantos-org/circuits package via `?url` imports.
ARG VITE_CHAIN_ID
ARG VITE_CHAIN_NAME
ARG VITE_RPC_URL
ARG VITE_MASP_ADDRESS
ARG VITE_RELAYER_URL
ARG VITE_FMD_URL
ARG VITE_RELAYER_ADDRESS
ARG VITE_TREE_DEPTH
ARG VITE_PERMIT2_ADDRESS
# Blank hides the native-ETH deposit/withdraw option.
ARG VITE_NATIVE_ADAPTER_ADDRESS
ARG VITE_EXPLORER_URL
ARG VITE_EXPLORER_API_URL
# Swap tab stays inert unless both of these are set.
ARG VITE_METAQUOTER_URL
ARG VITE_SWAP_WRAPPER_ADDRESS

ENV VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_CHAIN_NAME=$VITE_CHAIN_NAME \
    VITE_RPC_URL=$VITE_RPC_URL \
    VITE_MASP_ADDRESS=$VITE_MASP_ADDRESS \
    VITE_RELAYER_URL=$VITE_RELAYER_URL \
    VITE_FMD_URL=$VITE_FMD_URL \
    VITE_RELAYER_ADDRESS=$VITE_RELAYER_ADDRESS \
    VITE_TREE_DEPTH=$VITE_TREE_DEPTH \
    VITE_PERMIT2_ADDRESS=$VITE_PERMIT2_ADDRESS \
    VITE_NATIVE_ADAPTER_ADDRESS=$VITE_NATIVE_ADAPTER_ADDRESS \
    VITE_EXPLORER_URL=$VITE_EXPLORER_URL \
    VITE_EXPLORER_API_URL=$VITE_EXPLORER_API_URL \
    VITE_METAQUOTER_URL=$VITE_METAQUOTER_URL \
    VITE_SWAP_WRAPPER_ADDRESS=$VITE_SWAP_WRAPPER_ADDRESS

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
