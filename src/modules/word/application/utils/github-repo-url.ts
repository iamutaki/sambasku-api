/** Parse https://github.com/owner/repo → { owner, repo }. */
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } {
  const trimmed = url.replace(/\/+$/, '');
  const m = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!m) {
    throw new Error(`PRONUNCIACION_GITHUB_URL tidak valid: ${url}`);
  }
  return { owner: m[1], repo: m[2] };
}

/**
 * URL publik audio lewat jsDelivr CDN (repo GitHub publik).
 * @see https://www.jsdelivr.com/documentation#id-gh
 */
export function buildJsDelivrPublicUrl(input: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}): string {
  const clean = input.path.replace(/^\/+/, '');
  return `https://cdn.jsdelivr.net/gh/${input.owner}/${input.repo}@${input.branch}/${clean}`;
}

/** base64 tanpa Buffer — aman di Workers (chunk 8KB). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
