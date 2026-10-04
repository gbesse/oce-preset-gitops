import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const idPattern = /^ns_[A-Za-z0-9-]{8,128}$/;
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);

function canonical(value, depth = 0) {
  if (depth > 64) throw new Error('E_DEPTH');
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (unsafe.has(key)) throw new Error('E_UNSAFE_KEY');
      result[key] = canonical(value[key], depth + 1);
    }
    return result;
  }
  return value;
}

export function fingerprint(template) {
  return createHash('sha256').update(JSON.stringify(canonical(template))).digest('hex');
}

export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('E_CONFIG');
  const baseUrl = new URL(input.baseUrl);
  if (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname))) throw new Error('E_HTTPS_REQUIRED');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error('E_URL_CREDENTIALS');
  if (typeof input.keyFile !== 'string' || !input.keyFile || typeof input.desiredDir !== 'string' || !input.desiredDir) throw new Error('E_CONFIG');
  return { ...input, baseUrl: baseUrl.toString().replace(/\/$/, '') };
}

async function readKey(file) {
  const info = await stat(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('E_KEY_PERMISSIONS');
  const raw = (await readFile(file, 'utf8')).trim();
  const key = raw.startsWith('{') ? JSON.parse(raw)?.data?.key : raw;
  if (typeof key !== 'string' || !/^[A-Za-z0-9._~+/-]{16,4096}$/.test(key)) throw new Error('E_KEY_FORMAT');
  return key;
}

async function desiredPresets(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const seen = new Set();
  const presets = [];
  for (const file of names) {
    const path = join(directory, file);
    const info = await stat(path);
    if (!info.isFile() || info.size > 1048576) throw new Error('E_PRESET_FILE');
    const preset = JSON.parse(await readFile(path, 'utf8'));
    if (!preset || !idPattern.test(preset.namespaceId) || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 200 || !preset.template || typeof preset.template !== 'object' || Array.isArray(preset.template) || Object.keys(preset).some((key) => !['namespaceId', 'name', 'template'].includes(key))) throw new Error('E_PRESET_SHAPE');
    const identity = `${preset.namespaceId}\0${preset.name}`;
    if (seen.has(identity)) throw new Error('E_DUPLICATE_PRESET');
    seen.add(identity);
    presets.push({ ...preset, file, digest: fingerprint(preset.template) });
  }
  if (!presets.length) throw new Error('E_NO_PRESETS');
  return presets;
}

async function api(baseUrl, key, method, path, body, fetchImpl) {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: { 'x-api-key': key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`E_HTTP_${response.status}`);
  const result = await response.json();
  if (!result || !result.meta?.requestId || !('data' in result)) throw new Error('E_API_SHAPE');
  return result.data;
}

async function planPresets(input, { fetchImpl = fetch } = {}) {
  const config = validateConfig(input);
  const key = await readKey(config.keyFile);
  const desired = await desiredPresets(resolve(config.desiredDir));
  const byNamespace = new Map();
  for (const preset of desired) {
    if (!byNamespace.has(preset.namespaceId)) {
      const list = await api(config.baseUrl, key, 'GET', `/namespaces/${preset.namespaceId}/presets`, null, fetchImpl);
      if (!Array.isArray(list)) throw new Error('E_API_SHAPE');
      byNamespace.set(preset.namespaceId, list);
    }
  }
  const operations = desired.map((preset) => {
    const remote = byNamespace.get(preset.namespaceId).find((item) => item.name === preset.name);
    const remoteDigest = remote ? fingerprint(remote.template) : null;
    return {
      file: preset.file, namespaceId: preset.namespaceId, name: preset.name,
      action: !remote ? 'create' : remoteDigest === preset.digest ? 'unchanged' : 'update',
      presetId: remote?.id ?? null, desiredDigest: preset.digest, remoteDigest,
      template: preset.template,
    };
  });
  return { config, key, operations };
}

export async function runGitops(input, mode, options = {}) {
  if (!['plan', 'check', 'apply'].includes(mode)) throw new Error('E_MODE');
  const { config, key, operations } = await planPresets(input, options);
  const changes = operations.filter((item) => item.action !== 'unchanged');
  if (mode === 'apply') {
    for (const item of changes) {
      const collection = `/namespaces/${item.namespaceId}/presets`;
      if (item.action === 'update') {
        const latest = await api(config.baseUrl, key, 'GET', `${collection}/${item.presetId}`, null, options.fetchImpl ?? fetch);
        if (latest.id !== item.presetId || fingerprint(latest.template) !== item.remoteDigest) throw new Error('E_STALE_PLAN');
        await api(config.baseUrl, key, 'PATCH', `${collection}/${item.presetId}`, { template: item.template }, options.fetchImpl ?? fetch);
      } else {
        await api(config.baseUrl, key, 'POST', collection, { name: item.name, template: item.template }, options.fetchImpl ?? fetch);
      }
    }
  }
  return {
    schema: 'oce-preset-gitops.v1', mode,
    status: mode === 'check' && changes.length ? 'drift' : 'ok',
    changes: changes.length,
    presets: operations.map(({ template, ...item }) => item),
  };
}
