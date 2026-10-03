import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { evaluateAudit } from './audit-policy.mjs';

const evidence = new URL('../artifacts/quality/', import.meta.url);

async function runAudit(filename, args) {
  const result = spawnSync('npm', ['audit', '--json', ...args], {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  await writeFile(new URL(filename, evidence), result.stdout ?? '');
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error(`npm audit failed to run (${result.error?.message ?? result.signal ?? result.status}).`);
  }
  const report = JSON.parse(result.stdout);
  if (result.status === 1 && report.metadata?.vulnerabilities?.total === 0) {
    throw new Error('npm audit failed without reporting vulnerabilities.');
  }
  return report;
}

async function main() {
  await mkdir(evidence, { recursive: true });
  const fullReport = await runAudit('audit.json', ['--include=dev', '--include=optional', '--include=peer']);
  const productionReport = await runAudit('audit-production.json', ['--omit=dev', '--include=optional', '--include=peer']);
  const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const exception = JSON.parse(await readFile(new URL('../docs/security/audit-exception.json', import.meta.url), 'utf8'));
  const result = evaluateAudit({ fullReport, productionReport, lockfile, exception });
  await writeFile(new URL('audit-policy.json', evidence), `${JSON.stringify(result, null, 2)}\n`);
  if (result.exceptionApplied) {
    console.log(`Accepted only ${result.advisory} in the pinned development chain until ${result.expiresAt}.`);
    console.log(`${result.toleratedFindings} audit entries covered; production audit is clean.`);
  } else {
    console.log('Full and production audits are clean. No exception is needed.');
  }
}

main().catch((error) => {
  console.error(`Audit gate blocked: ${error.message}`);
  process.exitCode = 1;
});
