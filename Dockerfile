FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM golang:1.26.2-bookworm AS go-build
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/agenthub ./cmd/app

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app

ENV PORT=8888
ENV REGION=us
ENV FRONTEND_DIST_DIR=/app/frontend/dist
ENV AGENT_TEMPLATE_GITHUB_URL=https://github.com/sealos-apps/Agent-Hub-Template

COPY --from=go-build /out/agenthub /app/agenthub
COPY --from=frontend-build /src/frontend/dist /app/frontend/dist

EXPOSE 8888

ENTRYPOINT ["/app/agenthub"]
