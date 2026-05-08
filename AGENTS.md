# Agent Instructions

## Local Development

This project is split into:

- `backend`: Go service
- `web`: React + Vite frontend

Start the backend first, then the frontend.

### Backend

```bash
cd backend
REGION=us go run ./cmd/app
```

Default backend URL:

```text
http://127.0.0.1:8999
```

Health checks:

```bash
curl http://127.0.0.1:8999/healthz
curl http://127.0.0.1:8999/readyz
```

The backend reads `backend/.env` in local development when present. `REGION` must be set; `us` is the usual local value.

### Frontend

Use Node `20.19+` or `22.12+`. On this machine, the working fnm install is:

```bash
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH
```

Install dependencies and start Vite:

```bash
cd web
npm install
npm run dev -- --host 0.0.0.0
```

Default frontend URL:

```text
http://localhost:3000/
```

Vite listens on port `3000` and proxies `/backend-api` to the backend. The default backend proxy target is:

```text
http://127.0.0.1:8999
```

If the backend runs on another port:

```bash
VITE_AGENTHUB_BACKEND_TARGET=http://127.0.0.1:<port> npm run dev -- --host 0.0.0.0
```

### Verified Startup

The known-good local startup is:

```bash
# terminal 1
cd backend
REGION=us go run ./cmd/app
```

```bash
# terminal 2
cd web
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm run dev -- --host 0.0.0.0
```

Expected listeners:

- backend: `8999`
- frontend: `3000`

Check them with:

```bash
lsof -iTCP:8999 -sTCP:LISTEN -n -P
lsof -iTCP:3000 -sTCP:LISTEN -n -P
```

### Detached Local Startup

Use `screen` when the services should keep running after the current shell command exits:

```bash
mkdir -p .local/logs

screen -dmS agenthub-backend zsh -lc 'cd /Users/jingyang/work/agent-hub/backend && REGION=us go run ./cmd/app 2>&1 | tee /Users/jingyang/work/agent-hub/.local/logs/backend.log'

screen -dmS agenthub-web zsh -lc 'cd /Users/jingyang/work/agent-hub/web && PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm run dev -- --host 0.0.0.0 2>&1 | tee /Users/jingyang/work/agent-hub/.local/logs/web.log'
```

Check sessions:

```bash
screen -ls
```

Stop services:

```bash
screen -S agenthub-backend -X quit
screen -S agenthub-web -X quit
```

Logs:

```bash
tail -f .local/logs/backend.log
tail -f .local/logs/web.log
```
