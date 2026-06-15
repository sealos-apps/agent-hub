# Agent Hub Cluster Image

This document describes how to build, publish, install, and configure the Agent Hub Sealos cluster image.

## Image Layout

The cluster image is built from this directory:

```text
deploy/
  Kubefile
  agent-hub-entrypoint.sh
  images/shim/images
  charts/agent-hub/
```

The cluster image only packages the Helm chart, entrypoint, and the runtime image preload metadata. The Agent Hub application still runs from the runtime container image:

```text
ghcr.io/<owner>/<repo>:sha-<short-sha>
```

The cluster image itself is published as:

```text
ghcr.io/<owner>/<repo>-cluster:sha-<short-sha>
```

Production builds should use `sha-*` tags. The repository defaults that still point at `ghcr.io/sealos-apps/agent-hub:latest` are render-safe defaults for local chart scanning, not production release values.

## GitHub Actions Build

The preferred build path is `.github/workflows/cluster-image.yml`.

On `main`, the workflow runs after the `Docker Image` workflow succeeds. It uses the current repository as the runtime image repository, so forks and personal repositories build against their own image:

```text
runtime image: ghcr.io/<owner>/<repo>:sha-<short-sha>
cluster image: ghcr.io/<owner>/<repo>-cluster:sha-<short-sha>
```

During the build, the workflow temporarily updates all image references inside the runner workspace:

| File | Value |
| --- | --- |
| `Kubefile` | `agentHubImageRepository`, `agentHubImageTag` |
| `images/shim/images` | Full runtime image reference |
| `charts/agent-hub/values.yaml` | `image.repository`, `image.tag` |

Manual workflow inputs:

| Input | Default | Description |
| --- | --- | --- |
| `runtime_image_repository` | `ghcr.io/<owner>/<repo>` | Runtime application image repository to embed. |
| `runtime_image_tag` | `sha-<short-sha>` | Runtime application image tag to embed. |
| `cluster_image_tag` | Same as `runtime_image_tag` | Cluster image tag to publish. |
| `push_latest` | `true` | Also publish `<cluster-image>:latest`. |

## Manual Build

Manual builds must keep the runtime repository and tag synchronized in every static source that `sealos build` scans.

Example:

```bash
cd deploy

runtime_repository=ghcr.io/<owner>/<repo>
runtime_tag=sha-<short-sha>
runtime_image="${runtime_repository}:${runtime_tag}"

printf '%s\n' "${runtime_image}" > images/shim/images
sed -i -E "s;^ENV agentHubImageRepository=\"[^\"]*\";ENV agentHubImageRepository=\"${runtime_repository}\";" Kubefile
sed -i -E "s;^ENV agentHubImageTag=\"[^\"]*\";ENV agentHubImageTag=\"${runtime_tag}\";" Kubefile
sed -i -E "0,/^  repository: .*/s|^  repository: .*|  repository: \"${runtime_repository}\"|" charts/agent-hub/values.yaml
sed -i -E "0,/^  tag: \"[^\"]*\"/s//  tag: \"${runtime_tag}\"/" charts/agent-hub/values.yaml

sealos build --pull=always --platform linux/amd64 \
  -t ghcr.io/<owner>/<repo>-cluster:${runtime_tag} \
  -f Kubefile

sealos push ghcr.io/<owner>/<repo>-cluster:${runtime_tag}
```

If only the cluster image `-t` changes, the embedded runtime image does not change. `sealos build` will still scan the image repository and tag from `images/shim/images` and the chart values.

## Install

Install the published cluster image with:

```bash
sealos run ghcr.io/<owner>/<repo>-cluster:sha-<short-sha>
```

Example: install this project into namespace `agenthub-system` and force region `us`:

```bash
sealos run ghcr.io/<owner>/<repo>-cluster:sha-<short-sha> \
  -e RELEASE_NAMESPACE=agenthub-system \
  -e AGENT_HUB_REGION=us
```

By default, the entrypoint installs:

| Item | Default |
| --- | --- |
| Helm release | `agenthub` |
| Namespace | `agent-hub` |
| Chart path | `./charts/agent-hub` |
| Workload name | `agent-hub` |
| User values file | `/root/.sealos/cloud/values/core/agent-hub-values.yaml` |

The entrypoint copies `charts/agent-hub/agent-hub-values.yaml` to the user values path on first install. Later installs preserve that file, so local overrides survive upgrades.

## Cluster Auto Configuration

The entrypoint reads `sealos-system/sealos-config` when present:

| ConfigMap key | Helm value or environment derived from it |
| --- | --- |
| `cloudDomain` | `ingress.host`, `agentHubConfig.cloudDomain`, `INGRESS_SUFFIX`, `SSH_DOMAIN`, AIProxy domains |
| `cloudPort` | `agentHubConfig.cloudPort` |
| `httpPort` | `agentHubConfig.httpPort` |
| `disableHttps` | `agentHubConfig.disableHttps`, TLS rendering, SSL redirect |
| `certSecretName` | `ingress.tlsSecretName`, `agentHubConfig.certSecretName` |
| `regionUID` | `REGION` fallback |

Default derived values:

| Value | Default rule |
| --- | --- |
| Agent Hub host | `agenthub.<cloudDomain>` |
| Agent ingress suffix | `agent.<cloudDomain>` |
| SSH domain | `ssh.<cloudDomain>` |
| Region | `cn` for `hzh`, `bja`, `gzg`, or `*.sealos.run`; otherwise `us` |
| AIProxy domain | `*.sealos.app` maps to matching `*.sealos.io`; other domains are used as-is |

The chart also registers two Sealos App resources when installed through the cluster image:

| App | Display |
| --- | --- |
| `agenthub` | Normal desktop app |
| `agenthub-console` | Hidden console window |

## Install Overrides

The entrypoint accepts both uppercase environment variables and lower camelCase `sealos run` variables. Uppercase values take precedence.

| Purpose | Uppercase variable | `sealos run` variable |
| --- | --- | --- |
| Runtime image repository | `AGENT_HUB_IMAGE_REPOSITORY` | `agentHubImageRepository` or `imageRepository` |
| Runtime image tag | `AGENT_HUB_IMAGE_TAG` | `agentHubImageTag` or `imageTag` |
| Workload name | `AGENT_HUB_FULLNAME` | `fullnameOverride` |
| Agent Hub host | `AGENT_HUB_HOST` | `agentHubHost` |
| Region | `AGENT_HUB_REGION` | `agentHubRegion`, `REGION`, or `region` |
| Template repository | `AGENT_TEMPLATE_GITHUB_URL` | `agentTemplateGitHubUrl` |
| Kubernetes proxy allowlist | `K8S_PROXY_ALLOWED_HOSTS` | `k8sProxyAllowedHosts` |
| WebSocket origin allowlist | `WS_ALLOWED_ORIGINS` | `wsAllowedOrigins` |

Generic Helm flags can be appended with:

| Variable | Usage |
| --- | --- |
| `HELM_OPTIONS` | Extra Helm arguments appended before `HELM_OPTS`. |
| `HELM_OPTS` | Extra Helm arguments appended last. |

Example override:

```bash
sealos run ghcr.io/<owner>/<repo>-cluster:sha-<short-sha> \
  -e AGENT_HUB_HOST=agenthub.example.com \
  -e AGENT_HUB_FULLNAME=agenthub-prod \
  -e WS_ALLOWED_ORIGINS=https://agenthub.example.com
```

## Upgrade

Build and publish a new runtime image and cluster image with the same `sha-*` tag, then run:

```bash
sealos run ghcr.io/<owner>/<repo>-cluster:sha-<new-short-sha>
```

The entrypoint uses `helm upgrade -i`, adopts existing Agent Hub resources into the Helm release when possible, and preserves the user values file.

## Uninstall

The cluster image installs Agent Hub as a Helm release, so the primary uninstall path is Helm:

```bash
helm uninstall agenthub -n agent-hub
```

Then remove the Sealos desktop App registrations:

```bash
kubectl -n app-system delete apps.app.sealos.io agenthub agenthub-console --ignore-not-found
```

If the namespace is dedicated to Agent Hub, remove it after the Helm release is gone:

```bash
kubectl delete namespace agent-hub
```

If the install used custom release or namespace values, replace the defaults:

```bash
helm uninstall <RELEASE_NAME> -n <RELEASE_NAMESPACE>
kubectl delete namespace <RELEASE_NAMESPACE>
```

Optional local cleanup:

```bash
rm -f /root/.sealos/cloud/values/core/agent-hub-values.yaml
sealos rmi ghcr.io/<owner>/<repo>-cluster:<tag>
```

The values file cleanup removes preserved local overrides. The `sealos rmi` cleanup only removes a local cluster image cache; it does not delete Kubernetes resources or remote GHCR images.

## Verification

After install or upgrade:

```bash
kubectl -n agent-hub rollout status deploy/agent-hub --timeout=180s
kubectl -n agent-hub get deploy,svc,ingress
kubectl -n app-system get apps.app.sealos.io agenthub agenthub-console
```

If `AGENT_HUB_FULLNAME` or `fullnameOverride` was used, replace `agent-hub` with that workload name.

Health checks:

```bash
curl -fsS https://<agent-hub-host>/healthz
curl -fsS https://<agent-hub-host>/readyz
```

## Troubleshooting

If `sealos build` tries to pull `ghcr.io/sealos-apps/agent-hub` in a fork or personal repository, the runtime image references were not synchronized. Check:

```bash
grep -n 'agentHubImageRepository\|agentHubImageTag' Kubefile
cat images/shim/images
grep -n 'repository:\|tag:' charts/agent-hub/values.yaml
```

If the workflow fails at `Verify runtime image exists`, the runtime Docker image was not published with the selected tag. Confirm the `Docker Image` workflow published `ghcr.io/<owner>/<repo>:sha-<short-sha>`.

If ingress is created without TLS, check `disableHttps` in `sealos-system/sealos-config`. When `disableHttps=true`, the chart omits TLS and disables NGINX SSL redirect.

If local settings do not update after rerunning `sealos run`, inspect:

```bash
cat /root/.sealos/cloud/values/core/agent-hub-values.yaml
```

That file is intentionally preserved across upgrades.
