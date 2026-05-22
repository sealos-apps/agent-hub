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

To run the local UI against a real Sealos workspace without embedding it in Sealos Desktop, store a base64 kubeconfig in `frontend/.env.local`:

```bash
AGENTHUB_LOCAL_KUBECONFIG_B64="<base64 kubeconfig>"
```

Generate the value with:

```bash
base64 -i /path/to/kubeconfig.yaml | tr -d '\n'
```

Then start normally:

```bash
npm run dev -- --host 0.0.0.0
```

You can also point `.env.local` at a local kubeconfig file:

```bash
VITE_AGENTHUB_ENABLE_LOCAL_SESSION=true
VITE_AGENTHUB_LOCAL_KUBECONFIG_PATH=/path/to/kubeconfig.yaml
```

## Verification

```bash
npm run lint
npm run test
npm run build
```
