// GitHub App installation tokens for the two automation identities
// (docs/agents/OPERATING-MODEL.md §5-6):
//   PinHunt review app: publishes the QA / Security verdict check runs
//   PinHunt merge app:  updates and merges eligible agent PRs
// Their private keys live only in environments restricted to `main`, so no
// branch workflow, PR code or development agent can act as either app.

import { createSign } from 'node:crypto';

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const b64url = buf => Buffer.from(buf).toString('base64url');

/** Short-lived (≤10 min) RS256 JWT identifying the app itself. */
export function appJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

/** REST call with an explicit token (an app JWT or an installation token). */
export async function ghAs(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Installation token limited to one repository and the given permissions. */
export async function installationToken({ appId, privateKey, repo, permissions }) {
  if (!appId || !privateKey) throw new Error('GitHub App ID or private key is not configured.');
  const jwt = appJwt(appId, privateKey);
  const installation = await ghAs(jwt, `/repos/${repo}/installation`);
  const { token } = await ghAs(jwt, `/app/installations/${installation.id}/access_tokens`, {
    method: 'POST', body: { repositories: [repo.split('/')[1]], permissions },
  });
  return token;
}
