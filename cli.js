#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runGitops } from './gitops.js';

if (process.argv.includes('--help')) {
  process.stdout.write('Utilisation / Usage / Uso: node cli.js plan|check|apply config.json\n');
  process.exit(0);
}
try {
  const mode = process.argv[2];
  const path = resolve(process.argv[3]);
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (typeof config.desiredDir === 'string' && !config.desiredDir.startsWith('/')) config.desiredDir = resolve(dirname(path), config.desiredDir);
  const report = await runGitops(config, mode);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'drift' ? 2 : 0;
} catch (error) {
  process.stderr.write(`oce-preset-gitops:${error.message?.startsWith('E_') ? error.message : 'E_RUN_FAILED'}\n`);
  process.exitCode = 1;
}
