{{- define "agent-hub.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agent-hub.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "agent-hub.labels" -}}
app.kubernetes.io/name: {{ include "agent-hub.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app: {{ include "agent-hub.fullname" . }}
cloud.sealos.io/app-deploy-manager: {{ include "agent-hub.fullname" . }}
{{- end -}}

{{- define "agent-hub.selectorLabels" -}}
app: {{ include "agent-hub.fullname" . }}
{{- end -}}

{{- define "agent-hub.scheme" -}}
{{- if eq (toString .Values.agentHubConfig.disableHttps) "true" -}}http{{- else -}}https{{- end -}}
{{- end -}}

{{- define "agent-hub.rawPort" -}}
{{- $scheme := include "agent-hub.scheme" . -}}
{{- $port := toString .Values.agentHubConfig.cloudPort -}}
{{- if eq $scheme "http" -}}
{{- $port = toString .Values.agentHubConfig.httpPort -}}
{{- end -}}
{{- trimPrefix ":" $port -}}
{{- end -}}

{{- define "agent-hub.port" -}}
{{- $scheme := include "agent-hub.scheme" . -}}
{{- $port := include "agent-hub.rawPort" . -}}
{{- if or (and (eq $scheme "https") (or (eq $port "") (eq $port "443"))) (and (eq $scheme "http") (or (eq $port "") (eq $port "80"))) -}}
{{- "" -}}
{{- else -}}
{{- $port -}}
{{- end -}}
{{- end -}}

{{- define "agent-hub.portSuffix" -}}
{{- $port := include "agent-hub.port" . -}}
{{- if $port -}}:{{ $port }}{{- end -}}
{{- end -}}

{{- define "agent-hub.host" -}}
{{- default (printf "agenthub.%s" .Values.agentHubConfig.cloudDomain) .Values.ingress.host -}}
{{- end -}}

{{- define "agent-hub.appUrl" -}}
{{- include "agent-hub.scheme" . -}}://{{ include "agent-hub.host" . }}{{ include "agent-hub.portSuffix" . }}
{{- end -}}
