import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateAudit } from '../../scripts/audit-policy.mjs';

const exception = JSON.parse(readFileSync(new URL('../../docs/security/audit-exception.json', import.meta.url), 'utf8'));
const now = Date.parse(exception.approvedAt) + 1000;
const leaf = {
  name: 'braces', dependency: 'braces',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
};

function report(vulnerabilities = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
  };
}

function fixture() {
  const vulnerabilities = {};
  for (const [name, via] of [['aislop', 'micromatch'], ['micromatch', 'braces'], ['braces', leaf]]) {
    vulnerabilities[name] = { name, nodes: [`node_modules/${name}`], via: [structuredClone(via)] };
  }
  return {
    exception: structuredClone(exception), now,
    fullReport: report(vulnerabilities),
    productionReport: report(),
    lockfile: {
      packages: {
        '': { devDependencies: { aislop: '0.16.1' } },
        'node_modules/aislop': { version: '0.16.1', dev: true, dependencies: { micromatch: '^4.0.8' } },
        'node_modules/micromatch': { version: '4.0.8', dev: true, dependencies: { braces: '^3.0.3' } },
        'node_modules/braces': { version: '3.0.3', dev: true },
      },
    },
  };
}

test('accepts only the approved development chain during its seven-day window', () => {
  const result = evaluateAudit(fixture());
  assert.equal(result.exceptionApplied, true);
  assert.equal(result.toleratedFindings, 3);
  assert.equal(result.expiresAt, exception.expiresAt);
});

test('a clean audit after removing the affected dependency needs no exception', () => {
  const input = fixture();
  input.fullReport = report();
  delete input.lockfile.packages['node_modules/braces'];
  input.now = Date.parse(exception.expiresAt) + 1;
  assert.deepEqual(evaluateAudit(input), { exceptionApplied: false, toleratedFindings: 0 });
});

test('a zero-result audit still checks the installed affected dependency and expiry', () => {
  const input = fixture();
  input.fullReport = report();
  assert.equal(evaluateAudit(input).exceptionApplied, true);
  input.now = Date.parse(exception.expiresAt);
  assert.throws(() => evaluateAudit(input), /expired/);
});

const rejectedCases = [
  ['exact expiry boundary', (input) => { input.now = Date.parse(exception.expiresAt); }],
  ['after expiry', (input) => { input.now = Date.parse(exception.expiresAt) + 1; }],
  ['before approval', (input) => { input.now = Date.parse(exception.approvedAt) - 1; }],
  ['invalid clock', (input) => { input.now = Number.NaN; }],
  ['missing exception', (input) => { input.exception = null; }],
  ['another advisory exception', (input) => { input.exception.advisory = 'GHSA-other'; }],
  ['unapproved owner', (input) => { input.exception.approvedBy = 'someone-else'; }],
  ['extended window', (input) => { input.exception.expiresAt = '2026-10-11T01:32:23.453Z'; }],
  ['invalid exception date', (input) => { input.exception.expiresAt = 'invalid'; }],
  ['production finding', (input) => { input.productionReport = structuredClone(input.fullReport); }],
  ['unknown dependency', (input) => {
    input.fullReport.vulnerabilities.other = { name: 'other', nodes: ['node_modules/other'], via: [leaf] };
    input.fullReport.metadata.vulnerabilities.total += 1;
  }],
  ['another braces advisory', (input) => {
    input.fullReport.vulnerabilities.braces.via.push({ ...leaf, url: 'https://github.com/advisories/GHSA-other' });
  }],
  ['replaced braces advisory', (input) => {
    input.fullReport.vulnerabilities.braces.via[0].url = 'https://github.com/advisories/GHSA-other';
  }],
  ['wrong advisory package', (input) => { input.fullReport.vulnerabilities.braces.via[0].dependency = 'other'; }],
  ['unapproved parent chain', (input) => { input.fullReport.vulnerabilities.aislop.via = ['braces']; }],
  ['missing leaf finding', (input) => {
    delete input.fullReport.vulnerabilities.braces;
    input.fullReport.metadata.vulnerabilities.total -= 1;
  }],
  ['additional installed node', (input) => {
    input.fullReport.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces');
  }],
  ['wrong installed node', (input) => { input.fullReport.vulnerabilities.braces.nodes = ['node_modules/other']; }],
  ['runtime dependency', (input) => { input.lockfile.packages['node_modules/braces'].dev = false; }],
  ['root runtime dependency', (input) => { input.lockfile.packages[''].dependencies = { aislop: '0.16.1' }; }],
  ['different installed version', (input) => { input.lockfile.packages['node_modules/braces'].version = '3.0.2'; }],
  ['different exception version', (input) => { input.exception.versions.braces = '3.0.2'; }],
  ['changed declared dependency', (input) => {
    input.lockfile.packages['node_modules/micromatch'].dependencies.braces = '^3.0.2';
  }],
  ['additional braces copy', (input) => {
    input.lockfile.packages['node_modules/other/node_modules/braces'] = { version: '3.0.3', dev: true };
  }],
  ['audit service error', (input) => { input.fullReport.error = { code: 'E503' }; }],
  ['audit metadata mismatch', (input) => { input.fullReport.metadata.vulnerabilities.total = 0; }],
  ['missing audit metadata', (input) => { delete input.fullReport.metadata; }],
  ['unsupported audit format', (input) => { input.fullReport.auditReportVersion = 1; }],
  ['malformed audit entry', (input) => { input.fullReport.vulnerabilities.braces.via = []; }],
  ['missing installed nodes', (input) => { delete input.fullReport.vulnerabilities.braces.nodes; }],
  ['malformed production audit', (input) => { input.productionReport = {}; }],
  ['array of findings instead of a report map', (input) => { input.productionReport.vulnerabilities = []; }],
  ['missing lock on a clean audit', (input) => { input.fullReport = report(); input.lockfile = {}; }],
  ['malformed lock on a clean audit', (input) => { input.fullReport = report(); input.lockfile.packages = []; }],
];

for (const [name, mutate] of rejectedCases) {
  test(`audit gate rejects ${name}`, () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => evaluateAudit(input));
  });
}
