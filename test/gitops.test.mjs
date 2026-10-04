import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGitops } from '../gitops.js';

const namespaceId = 'ns_123e4567-e89b-42d3-a456-426614174000';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'oce-presets-'));
  const desiredDir = join(directory, 'presets');
  const keyFile = join(directory, 'service.key');
  await mkdir(desiredDir);
  await writeFile(keyFile, 'service-key-1234567890', { mode: 0o600 });
  await writeFile(join(desiredDir, 'sales.json'), JSON.stringify({
    namespaceId, name: 'Sales assistant', template: { agent: { name: 'PRIVATE CUSTOMER', executionMode: 'embedded' } },
  }));
  return { directory, desiredDir, keyFile };
}

async function withServer(initial, callback, { mutateBeforeExact = false } = {}) {
  const presets = [...initial];
  const writes = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.headers['x-api-key'], 'service-key-1234567890');
    const body = await new Promise((resolve) => {
      let text = '';
      request.on('data', (data) => { text += data; });
      request.on('end', () => resolve(text ? JSON.parse(text) : null));
    });
    const collection = `/namespaces/${namespaceId}/presets`;
    let data;
    let status = 200;
    if (request.method === 'GET' && request.url === collection) data = presets;
    else if (request.method === 'GET' && request.url === `${collection}/pre_existing`) {
      data = presets[0];
      if (mutateBeforeExact) data = { ...data, template: { agent: { name: 'someone changed this' } } };
    } else if (request.method === 'POST' && request.url === collection) {
      status = 201;
      data = { id: `pre_${presets.length + 1}`, namespaceId, ...body };
      presets.push(data);
      writes.push('POST');
    } else if (request.method === 'PATCH' && request.url === `${collection}/pre_existing`) {
      data = { ...presets[0], template: body.template };
      presets[0] = data;
      writes.push('PATCH');
    } else status = 404;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data, meta: { requestId: 'req_test' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await callback(`http://127.0.0.1:${server.address().port}`, writes); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('plan reports drift without template contents; apply updates and becomes clean', async () => {
  const config = await fixture();
  const initial = [{ id: 'pre_existing', namespaceId, name: 'Sales assistant', template: { agent: { name: 'old' } } }];
  await withServer(initial, async (baseUrl, writes) => {
    const input = { ...config, baseUrl };
    const plan = await runGitops(input, 'check');
    assert.equal(plan.status, 'drift');
    assert.equal(plan.presets[0].action, 'update');
    assert.equal(JSON.stringify(plan).includes('PRIVATE CUSTOMER'), false);
    assert.deepEqual(writes, []);
    const applied = await runGitops(input, 'apply');
    assert.equal(applied.status, 'ok');
    assert.deepEqual(writes, ['PATCH']);
    const clean = await runGitops(input, 'check');
    assert.equal(clean.status, 'ok');
    assert.equal(clean.changes, 0);
  });
});

test('apply fails closed when preset changed after the plan', async () => {
  const config = await fixture();
  const initial = [{ id: 'pre_existing', namespaceId, name: 'Sales assistant', template: { agent: { name: 'old' } } }];
  await withServer(initial, async (baseUrl, writes) => {
    await assert.rejects(runGitops({ ...config, baseUrl }, 'apply'), /E_STALE_PLAN/);
    assert.deepEqual(writes, []);
  }, { mutateBeforeExact: true });
});

test('apply creates a missing preset and leaves unrelated remote presets alone', async () => {
  const config = await fixture();
  const initial = [{ id: 'pre_other', namespaceId, name: 'Other team', template: {} }];
  await withServer(initial, async (baseUrl, writes) => {
    const input = { ...config, baseUrl };
    const plan = await runGitops(input, 'plan');
    assert.equal(plan.presets[0].action, 'create');
    const applied = await runGitops(input, 'apply');
    assert.equal(applied.changes, 1);
    assert.deepEqual(writes, ['POST']);
    assert.equal((await runGitops(input, 'check')).status, 'ok');
  });
});

test('a private key file is required', async () => {
  const config = await fixture();
  await chmod(config.keyFile, 0o644);
  await assert.rejects(runGitops({ ...config, baseUrl: 'http://127.0.0.1:12345' }, 'plan'), /E_KEY_PERMISSIONS/);
});
