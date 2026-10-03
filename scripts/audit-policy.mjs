const ADVISORY = 'GHSA-vfj7-8cjw-p6xm';
const ADVISORY_URL = `https://github.com/advisories/${ADVISORY}`;
const MAX_EXCEPTION_MS = 7 * 24 * 60 * 60 * 1000;
const VERSIONS = { aislop: '0.16.1', micromatch: '4.0.8', braces: '3.0.3' };
const PARENTS = { aislop: 'micromatch', micromatch: 'braces' };

function requireValidReport(report) {
  if (report?.auditReportVersion !== 2 || report.error
    || !report.vulnerabilities || typeof report.vulnerabilities !== 'object'
    || Array.isArray(report.vulnerabilities)) {
    throw new Error('Audit did not return a complete version-2 report.');
  }
  const entries = Object.entries(report.vulnerabilities);
  const total = report.metadata?.vulnerabilities?.total;
  if (!Number.isInteger(total) || total !== entries.length) {
    throw new Error('Audit findings and metadata do not agree.');
  }
  for (const [name, entry] of entries) {
    if (entry?.name !== name || !Array.isArray(entry.via) || entry.via.length === 0) {
      throw new Error(`Incomplete audit finding: ${name}.`);
    }
    if (!Array.isArray(entry.nodes) || entry.nodes.length === 0) {
      throw new Error(`Audit finding has no installed nodes: ${name}.`);
    }
  }
  return entries;
}

function requireActiveException(exception, now) {
  if (exception?.advisory !== ADVISORY || exception.approvedBy !== 'project-owner') {
    throw new Error('No approved exception for this advisory.');
  }
  const approved = Date.parse(exception.approvedAt);
  const expires = Date.parse(exception.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(approved) || !Number.isFinite(expires)
    || expires <= approved || expires - approved > MAX_EXCEPTION_MS) {
    throw new Error('Exception dates must define at most seven days.');
  }
  if (now < approved || now >= expires) {
    throw new Error('The audit exception is not active or has expired.');
  }
}

function requireDevOnlyChain(lockfile, exception) {
  const packages = lockfile?.packages;
  if (!packages || packages['']?.dependencies?.aislop
    || packages['']?.devDependencies?.aislop !== VERSIONS.aislop) {
    throw new Error('The exception requires the pinned development-only AIslop dependency.');
  }
  for (const [name, version] of Object.entries(VERSIONS)) {
    const entry = packages[`node_modules/${name}`];
    if (exception.versions?.[name] !== version || entry?.version !== version || entry.dev !== true) {
      throw new Error(`The exception does not cover this installed ${name} dependency.`);
    }
  }
  if (packages['node_modules/aislop'].dependencies?.micromatch !== '^4.0.8'
    || packages['node_modules/micromatch'].dependencies?.braces !== '^3.0.3') {
    throw new Error('The installed dependency chain differs from the approved exception.');
  }
  const bracesPaths = Object.keys(packages).filter((path) => path.endsWith('/braces'));
  if (bracesPaths.length !== 1 || bracesPaths[0] !== 'node_modules/braces') {
    throw new Error('Additional braces installations are not covered by the exception.');
  }
}

function requireAllowedFinding(name, entry, findings) {
  if (!Object.hasOwn(VERSIONS, name) || entry.nodes.length !== 1
    || entry.nodes[0] !== `node_modules/${name}` || entry.via.length !== 1) {
    throw new Error(`Unapproved audit finding or installed node: ${name}.`);
  }
  const via = entry.via[0];
  if (name === 'braces') {
    if (via?.name !== 'braces' || via.dependency !== 'braces' || via.url !== ADVISORY_URL) {
      throw new Error('The braces finding is not the approved advisory.');
    }
  } else if (via !== PARENTS[name] || !Object.hasOwn(findings, via)) {
    throw new Error(`Unapproved or unresolved advisory chain: ${name}.`);
  }
}

function hasKnownAffectedBraces(lockfile) {
  return Object.entries(lockfile?.packages ?? {}).some(([path, entry]) => {
    if (!path.endsWith('/braces') || typeof entry.version !== 'string') return false;
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(entry.version);
    if (!match) return entry.version === VERSIONS.braces;
    const [, major, minor, patch] = match.map(Number);
    return major < 3 || (major === 3 && (minor === 0 && patch <= 3));
  });
}

export function evaluateAudit({ fullReport, productionReport, lockfile, exception, now = Date.now() }) {
  if (!lockfile?.packages || typeof lockfile.packages !== 'object'
    || Array.isArray(lockfile.packages) || !lockfile.packages['']) {
    throw new Error('A complete package lock is required for the audit gate.');
  }
  const findings = requireValidReport(fullReport);
  const production = requireValidReport(productionReport);
  if (production.length !== 0) throw new Error('Production dependencies must have zero audit findings.');
  if (findings.length === 0 && !hasKnownAffectedBraces(lockfile)) {
    return { exceptionApplied: false, toleratedFindings: 0 };
  }
  requireActiveException(exception, now);
  requireDevOnlyChain(lockfile, exception);
  for (const [name, entry] of findings) {
    requireAllowedFinding(name, entry, fullReport.vulnerabilities);
  }
  return {
    exceptionApplied: true,
    toleratedFindings: findings.length,
    advisory: ADVISORY,
    expiresAt: exception.expiresAt,
  };
}
