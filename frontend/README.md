# Agent Hub Frontend

React + TypeScript + Vite frontend for Agent Hub.

## Development

```bash
npm install
npm run dev -- --host 0.0.0.0
```

The dev server listens on `http://localhost:3000/` and proxies `/backend-api` to `http://127.0.0.1:8888` by default.

Override the backend target when needed:

```bash
VITE_AGENTHUB_BACKEND_TARGET=http://127.0.0.1:<port> npm run dev -- --host 0.0.0.0
```

Local demo data is disabled by default. To run the UI without a real cluster during isolated frontend work:

```bash
VITE_AGENTHUB_LOCAL_DEMO=true npm run dev -- --host 0.0.0.0
```

## Verification

```bash
npm run lint
npm run test
npm run build
```
