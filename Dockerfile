FROM node:22-bookworm-slim AS web-build
WORKDIR /src/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM golang:1.26.2-bookworm AS go-build
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/agenthub ./cmd/app

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app

ENV PORT=8999
ENV WEB_DIST_DIR=/app/web/dist
ENV AGENT_MANIFEST_TEMPLATE_DIR=/app/template

COPY --from=go-build /out/agenthub /app/agenthub
COPY --from=web-build /src/web/dist /app/web/dist
COPY template/ /app/template/

EXPOSE 8999

ENTRYPOINT ["/app/agenthub"]
