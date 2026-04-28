/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { findExecPodForApp } from './k8s'
import {
  base64ToText,
  buildProxyUrl,
  fileToBase64,
  parseContentDispositionFilename,
  requestJsonWithAuthRetry,
  requestRawWithAuthRetry,
  textToBase64,
} from './shared'

export const uploadFileToPod = async ({ appName, file, targetDirectory }, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法上传文件')
  }
  if (!file) {
    throw new Error('请先选择要上传的文件')
  }

  const pod = await findExecPodForApp(appName, clusterContext)
  const contentBase64 = await fileToBase64(file)
  const response = await requestJsonWithAuthRetry(buildProxyUrl('/files/upload'), clusterContext, {
    method: 'POST',
    body: JSON.stringify({
      namespace: pod.namespace,
      podName: pod.podName,
      containerName: pod.containerName,
      targetDirectory,
      fileName: file.name,
      contentBase64,
    }),
  })

  return {
    ...response,
    podName: pod.podName,
    containerName: pod.containerName,
  }
}

export const downloadFileFromPod = async ({ appName, remotePath }, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法下载文件')
  }
  if (!remotePath) {
    throw new Error('请输入容器内文件路径')
  }

  const pod = await findExecPodForApp(appName, clusterContext)
  const response = await requestRawWithAuthRetry(buildProxyUrl('/files/download'), clusterContext, {
    method: 'POST',
    body: JSON.stringify({
      namespace: pod.namespace,
      podName: pod.podName,
      containerName: pod.containerName,
      remotePath,
    }),
  })

  return {
    blob: await response.blob(),
    fileName:
      parseContentDispositionFilename(response.headers.get('content-disposition') || '') ||
      remotePath.split('/').filter(Boolean).pop() ||
      `${appName}.dat`,
    podName: pod.podName,
    containerName: pod.containerName,
  }
}

export const listFilesInPod = async ({ appName, directory }, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法读取目录')
  }

  const pod = await findExecPodForApp(appName, clusterContext)
  const response = await requestJsonWithAuthRetry(buildProxyUrl('/files/list'), clusterContext, {
    method: 'POST',
    body: JSON.stringify({
      namespace: pod.namespace,
      podName: pod.podName,
      containerName: pod.containerName,
      directory,
    }),
  })

  return {
    ...response,
    podName: pod.podName,
    containerName: pod.containerName,
  }
}

export const readFileFromPod = async ({ appName, remotePath }, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法读取文件')
  }
  if (!remotePath) {
    throw new Error('缺少文件路径，无法读取文件')
  }

  const pod = await findExecPodForApp(appName, clusterContext)
  const response = await requestJsonWithAuthRetry(buildProxyUrl('/files/read'), clusterContext, {
    method: 'POST',
    body: JSON.stringify({
      namespace: pod.namespace,
      podName: pod.podName,
      containerName: pod.containerName,
      remotePath,
    }),
  })

  return {
    ...response,
    content: base64ToText(response?.contentBase64 || ''),
    podName: pod.podName,
    containerName: pod.containerName,
  }
}

export const saveFileToPod = async ({ appName, remotePath, content }, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法保存文件')
  }
  if (!remotePath) {
    throw new Error('缺少文件路径，无法保存文件')
  }

  const pod = await findExecPodForApp(appName, clusterContext)
  const response = await requestJsonWithAuthRetry(buildProxyUrl('/files/save'), clusterContext, {
    method: 'POST',
    body: JSON.stringify({
      namespace: pod.namespace,
      podName: pod.podName,
      containerName: pod.containerName,
      remotePath,
      contentBase64: textToBase64(content),
    }),
  })

  return {
    ...response,
    podName: pod.podName,
    containerName: pod.containerName,
  }
}
