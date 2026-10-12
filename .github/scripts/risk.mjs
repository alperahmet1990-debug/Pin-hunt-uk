// Merge risk tiers for pull requests (docs/agents/OPERATING-MODEL.md §6).
//
//   low    L1 agent work, no risky paths or labels → merges automatically once
//          CI, independent QA and (where required) security review pass.
//   medium L2, security-required or device-check work → also needs the
//          maintainer's `merge-approved` label on the current head.
//   high   infrastructure, database, auth, payments, shipping, release,
//          agent configuration, L3 and every non-agent branch → never merged
//          automatically; the maintainer approves and merges by hand.
//
// Pure functions only; the workflows feed them GitHub data. Unit-tested.

/** True when the security review is mandatory for this PR. */
export function securityRequired({ files, issueLabels = [], prLabels = [], paths }) {
  if (prLabels.includes('security:required')) return true;
  if (issueLabels.some(l => /^autonomy:L[23]$/.test(l))) return true;
  return files.some(f => paths.sensitive.some(re => re.test(f)) || paths.protected.some(re => re.test(f)));
}

/**
 * @param {object} input
 * @param {string} input.branch        PR head branch
 * @param {string[]} input.files       changed paths (including previous names of renames)
 * @param {string[]} input.prLabels
 * @param {string[]} input.issueLabels labels of the linked issue(s)
 * @param {boolean} input.linkedIssue  exactly one open, approved issue is linked
 * @param {object} input.paths         loadAgentPaths() result
 * @returns {{ tier: 'low'|'medium'|'high', reasons: string[] }}
 */
export function classifyRisk({ branch, files, prLabels = [], issueLabels = [], linkedIssue = true, paths }) {
  const high = [];
  const medium = [];
  const labels = [...new Set([...prLabels, ...issueLabels])];

  if (!String(branch).startsWith('claude/')) high.push('not an agent branch (claude/*)');
  if (!linkedIssue) high.push('no single approved linked issue');
  const protectedHits = files.filter(f => paths.protected.some(re => re.test(f)));
  if (protectedHits.length) high.push(`agent/CI configuration: ${protectedHits.join(', ')}`);
  const riskyPaths = files.filter(f => paths.highRisk.some(re => re.test(f)));
  if (riskyPaths.length) high.push(`high-risk paths: ${riskyPaths.join(', ')}`);
  const keywordPaths = paths.highRiskKeywords ? files.filter(f => paths.highRiskKeywords.test(f)) : [];
  if (keywordPaths.length) high.push(`payments/shipping code: ${keywordPaths.join(', ')}`);
  const riskyLabels = labels.filter(l => paths.highRiskLabels.includes(l));
  if (riskyLabels.length) high.push(`labels: ${riskyLabels.join(', ')}`);
  if (labels.includes('human-approved-config')) high.push('human-approved-config change');

  if (!issueLabels.includes('autonomy:L1')) medium.push(issueLabels.find(l => l.startsWith('autonomy:')) ?? 'no autonomy label');
  if (securityRequired({ files, issueLabels, prLabels, paths })) medium.push('security review required');
  if (labels.includes('needs-device-check')) medium.push('needs-device-check');
  const sensitiveHits = files.filter(f => paths.sensitive.some(re => re.test(f)));
  if (sensitiveHits.length) medium.push(`sensitive paths: ${sensitiveHits.join(', ')}`);

  if (high.length) return { tier: 'high', reasons: high };
  if (medium.length) return { tier: 'medium', reasons: medium };
  return { tier: 'low', reasons: ['L1, no risky paths or labels'] };
}
