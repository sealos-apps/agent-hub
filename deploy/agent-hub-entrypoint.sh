#!/bin/bash
set -e

RELEASE_NAME=${RELEASE_NAME:-"agenthub"}
RELEASE_NAMESPACE=${RELEASE_NAMESPACE:-"agent-hub"}
CHART_PATH=${CHART_PATH:-"./charts/agent-hub"}
HELM_OPTS=${HELM_OPTS:-""}
HELM_OPTIONS=${HELM_OPTIONS:-""}
AUTO_CONFIG_HELM_OPTS=""

get_cm_value() {
  local namespace="$1"
  local name="$2"
  local key="$3"
  kubectl get configmap "${name}" -n "${namespace}" -o "jsonpath={.data.${key}}" 2>/dev/null || true
}

add_set_string() {
  local key="$1"
  local value="$2"
  if [ -n "${value}" ]; then
    value=${value//\\/\\\\}
    value=${value//,/\\,}
    AUTO_CONFIG_HELM_OPTS="${AUTO_CONFIG_HELM_OPTS} --set-string ${key}=${value}"
  fi
}

derive_region() {
  local explicit="$1"
  local region_uid="$2"
  local cloud_domain="$3"

  if [ -n "${explicit}" ]; then
    echo "${explicit}"
    return
  fi

  case "${region_uid}" in
    hzh|bja|gzg)
      echo "cn"
      return
      ;;
  esac

  case "${cloud_domain}" in
    *.sealos.run)
      echo "cn"
      ;;
    *)
      echo "us"
      ;;
  esac
}

aiproxy_domain_for() {
  local cloud_domain="$1"
  case "${cloud_domain}" in
    *.sealos.app)
      echo "${cloud_domain%.sealos.app}.sealos.io"
      ;;
    *)
      echo "${cloud_domain}"
      ;;
  esac
}

CONFIG_CLOUD_DOMAIN=$(get_cm_value sealos-system sealos-config cloudDomain)
CONFIG_CLOUD_PORT=$(get_cm_value sealos-system sealos-config cloudPort)
CONFIG_HTTP_PORT=$(get_cm_value sealos-system sealos-config httpPort)
CONFIG_DISABLE_HTTPS=$(get_cm_value sealos-system sealos-config disableHttps)
CONFIG_CERT_SECRET_NAME=$(get_cm_value sealos-system sealos-config certSecretName)
CONFIG_REGION_UID=$(get_cm_value sealos-system sealos-config regionUID)

SEALOS_CLOUD_DOMAIN=${SEALOS_CLOUD_DOMAIN:-"${cloudDomain:-${CONFIG_CLOUD_DOMAIN}}"}
SEALOS_CLOUD_PORT=${SEALOS_CLOUD_PORT:-"${cloudPort:-${CONFIG_CLOUD_PORT}}"}
SEALOS_HTTP_PORT=${SEALOS_HTTP_PORT:-"${httpPort:-${CONFIG_HTTP_PORT}}"}
SEALOS_DISABLE_HTTPS=${SEALOS_DISABLE_HTTPS:-"${disableHttps:-${CONFIG_DISABLE_HTTPS}}"}
SEALOS_CERT_SECRET_NAME=${SEALOS_CERT_SECRET_NAME:-"${certSecretName:-${CONFIG_CERT_SECRET_NAME}}"}
SEALOS_REGION_UID=${SEALOS_REGION_UID:-"${regionUID:-${CONFIG_REGION_UID}}"}

AGENT_HUB_IMAGE_REPOSITORY=${AGENT_HUB_IMAGE_REPOSITORY:-"${agentHubImageRepository:-${imageRepository:-}}"}
AGENT_HUB_IMAGE_TAG=${AGENT_HUB_IMAGE_TAG:-"${agentHubImageTag:-${imageTag:-}}"}
AGENT_HUB_FULLNAME=${AGENT_HUB_FULLNAME:-"${fullnameOverride:-agent-hub}"}
AGENT_HUB_HOST=${AGENT_HUB_HOST:-"${agentHubHost:-}"}
AGENT_HUB_REGION=${AGENT_HUB_REGION:-"${agentHubRegion:-${REGION:-${region:-}}}"}
AGENT_TEMPLATE_GITHUB_URL=${AGENT_TEMPLATE_GITHUB_URL:-"${agentTemplateGitHubUrl:-}"}
K8S_PROXY_ALLOWED_HOSTS=${K8S_PROXY_ALLOWED_HOSTS:-"${k8sProxyAllowedHosts:-}"}
WS_ALLOWED_ORIGINS=${WS_ALLOWED_ORIGINS:-"${wsAllowedOrigins:-}"}

if [ -n "${SEALOS_CLOUD_DOMAIN}" ] && [ -z "${AGENT_HUB_HOST}" ]; then
  AGENT_HUB_HOST="agenthub.${SEALOS_CLOUD_DOMAIN}"
fi

AGENT_HUB_REGION=$(derive_region "${AGENT_HUB_REGION}" "${SEALOS_REGION_UID}" "${SEALOS_CLOUD_DOMAIN}")

if [ -n "${SEALOS_CLOUD_DOMAIN}" ]; then
  AIPROXY_DOMAIN=$(aiproxy_domain_for "${SEALOS_CLOUD_DOMAIN}")
  INGRESS_SUFFIX=${INGRESS_SUFFIX:-"${ingressSuffix:-agent.${SEALOS_CLOUD_DOMAIN}}"}
  SSH_DOMAIN=${SSH_DOMAIN:-"${sshDomain:-ssh.${SEALOS_CLOUD_DOMAIN}}"}
  AIPROXY_MANAGER_BASE_URL=${AIPROXY_MANAGER_BASE_URL:-"${aiproxyManagerBaseUrl:-https://aiproxy-web.${AIPROXY_DOMAIN}}"}
  AIPROXY_MODEL_BASE_URL=${AIPROXY_MODEL_BASE_URL:-"${aiproxyModelBaseUrl:-https://aiproxy.${AIPROXY_DOMAIN}/v1}"}
fi

add_set_string fullnameOverride "${AGENT_HUB_FULLNAME}"
add_set_string image.repository "${AGENT_HUB_IMAGE_REPOSITORY}"
add_set_string image.tag "${AGENT_HUB_IMAGE_TAG}"
add_set_string ingress.host "${AGENT_HUB_HOST}"
add_set_string ingress.tlsSecretName "${SEALOS_CERT_SECRET_NAME}"
add_set_string agentHubConfig.cloudDomain "${SEALOS_CLOUD_DOMAIN}"
add_set_string agentHubConfig.cloudPort "${SEALOS_CLOUD_PORT}"
add_set_string agentHubConfig.httpPort "${SEALOS_HTTP_PORT}"
add_set_string agentHubConfig.disableHttps "${SEALOS_DISABLE_HTTPS}"
add_set_string agentHubConfig.certSecretName "${SEALOS_CERT_SECRET_NAME}"
add_set_string appRegistration.enabled "true"

if [ "${SEALOS_DISABLE_HTTPS}" = "true" ]; then
  add_set_string 'ingress.annotations.nginx\.ingress\.kubernetes\.io/ssl-redirect' "false"
fi

add_set_string env.REGION "${AGENT_HUB_REGION}"
add_set_string env.INGRESS_SUFFIX "${INGRESS_SUFFIX:-}"
add_set_string env.SSH_DOMAIN "${SSH_DOMAIN:-}"
add_set_string env.AIPROXY_MANAGER_BASE_URL "${AIPROXY_MANAGER_BASE_URL:-}"
add_set_string env.AIPROXY_MODEL_BASE_URL "${AIPROXY_MODEL_BASE_URL:-}"
add_set_string env.AGENT_TEMPLATE_GITHUB_URL "${AGENT_TEMPLATE_GITHUB_URL}"
add_set_string env.K8S_PROXY_ALLOWED_HOSTS "${K8S_PROXY_ALLOWED_HOSTS}"
add_set_string env.WS_ALLOWED_ORIGINS "${WS_ALLOWED_ORIGINS}"

adopt_namespaced_resource() {
  local namespace="$1"
  local kind="$2"
  local name="$3"
  if kubectl -n "${namespace}" get "${kind}" "${name}" >/dev/null 2>&1; then
    echo "Adopting ${kind} ${namespace}/${name}..."
    kubectl -n "${namespace}" label "${kind}" "${name}" app.kubernetes.io/managed-by=Helm --overwrite >/dev/null 2>&1 || true
    kubectl -n "${namespace}" annotate "${kind}" "${name}" meta.helm.sh/release-name="${RELEASE_NAME}" meta.helm.sh/release-namespace="${RELEASE_NAMESPACE}" --overwrite >/dev/null 2>&1 || true
  fi
}

echo "Checking and adopting existing resources..."
if kubectl get namespace "${RELEASE_NAMESPACE}" >/dev/null 2>&1; then
  kubectl label namespace "${RELEASE_NAMESPACE}" app.kubernetes.io/managed-by=Helm --overwrite >/dev/null 2>&1 || true
  kubectl annotate namespace "${RELEASE_NAMESPACE}" meta.helm.sh/release-name="${RELEASE_NAME}" meta.helm.sh/release-namespace="${RELEASE_NAMESPACE}" --overwrite >/dev/null 2>&1 || true

  adopt_namespaced_resource "${RELEASE_NAMESPACE}" deployment "${AGENT_HUB_FULLNAME}"
  adopt_namespaced_resource "${RELEASE_NAMESPACE}" service "${AGENT_HUB_FULLNAME}"
  adopt_namespaced_resource "${RELEASE_NAMESPACE}" ingress "${AGENT_HUB_FULLNAME}"
fi

adopt_namespaced_resource app-system apps.app.sealos.io agenthub
adopt_namespaced_resource app-system apps.app.sealos.io agenthub-console

SERVICE_NAME="agent-hub"
USER_VALUES_PATH="/root/.sealos/cloud/values/core/${SERVICE_NAME}-values.yaml"

if [ ! -f "${USER_VALUES_PATH}" ]; then
  mkdir -p "$(dirname "${USER_VALUES_PATH}")"
  cp "./charts/${SERVICE_NAME}/${SERVICE_NAME}-values.yaml" "${USER_VALUES_PATH}"
fi

HELM_ARGS="${AUTO_CONFIG_HELM_OPTS} ${HELM_OPTIONS} ${HELM_OPTS}"

echo "Deploying Helm chart..."
helm upgrade -i "${RELEASE_NAME}" -n "${RELEASE_NAMESPACE}" --create-namespace "${CHART_PATH}" \
  -f "./charts/${SERVICE_NAME}/values.yaml" \
  -f "${USER_VALUES_PATH}" \
  ${HELM_ARGS}
