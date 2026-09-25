import { env } from '@/shared/config/env';
import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import type { PronunciationStoragePort } from '../application/ports/pronunciation-storage.port';
import { bytesToBase64, buildJsDelivrPublicUrl, parseGithubRepoUrl } from '../application/utils/github-repo-url';

const BRANCH = 'main';
const API_VERSION = '2022-11-28';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'SambasKu-API/pronunciation';

export { parseGithubRepoUrl, bytesToBase64, buildJsDelivrPublicUrl };

export class GitHubPronunciationStorageService implements PronunciationStoragePort {
  readonly providerName = 'github';

  private assertConfigured(): { token: string; owner: string; repo: string } {
    const token = env.PRONUNCIACION_GITHUB_TOKEN;
    const url = env.PRONUNCIACION_GITHUB_URL;
    if (!token || !url) {
      throw new ServiceUnavailableError(
        'PRONUNCIACION_UPLOAD_UNAVAILABLE',
        'Penyimpanan audio pelafalan belum dikonfigurasi - isi PRONUNCIACION_GITHUB_* di .env',
      );
    }
    const { owner, repo } = parseGithubRepoUrl(url);
    return { token, owner, repo };
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    };
  }

  /**
   * URL publik lewat jsDelivr (CDN) - bukan raw.githubusercontent.com.
   * Path immutable (ULID) jadi cache CDN aman; repo harus publik.
   */
  private publicUrl(owner: string, repo: string, path: string): string {
    return buildJsDelivrPublicUrl({ owner, repo, branch: BRANCH, path });
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempt = 0,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 && attempt < 1) {
        return this.fetchWithRetry(url, init, attempt + 1);
      }
      return res;
    } catch (err) {
      if (attempt < 1) {
        return this.fetchWithRetry(url, init, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async upload(input: {
    path: string;
    content: Uint8Array;
    mimeType: string;
  }): Promise<{ path: string; url: string; sha: string; size: number }> {
    const { token, owner, repo } = this.assertConfigured();
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${input.path}`;

    let res: Response;
    try {
      res = await this.fetchWithRetry(apiUrl, {
        method: 'PUT',
        headers: this.headers(token),
        body: JSON.stringify({
          message: `feat(pronunciation): add ${input.path}`,
          content: bytesToBase64(input.content),
          branch: BRANCH,
        }),
      });
    } catch (err) {
      logger.error({ err, path: input.path }, 'GitHub pronunciation upload network error');
      throw new BadGatewayError(
        'PRONUNCIACION_UPLOAD_FAILED',
        'Gagal mengunggah audio ke penyimpanan',
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: body.slice(0, 500), path: input.path },
        'GitHub pronunciation upload rejected',
      );
      if (res.status === 401 || res.status === 403) {
        throw new ServiceUnavailableError(
          'PRONUNCIACION_UPLOAD_UNAVAILABLE',
          'Token penyimpanan audio tidak valid atau tidak punya akses',
        );
      }
      throw new BadGatewayError(
        'PRONUNCIACION_UPLOAD_FAILED',
        'Gagal mengunggah audio ke penyimpanan',
      );
    }

    const json = (await res.json()) as {
      content?: { sha?: string; path?: string; size?: number };
    };
    const sha = json.content?.sha;
    if (!sha) {
      throw new BadGatewayError(
        'PRONUNCIACION_UPLOAD_FAILED',
        'Respons penyimpanan audio tidak berisi sha',
      );
    }

    return {
      path: input.path,
      url: this.publicUrl(owner, repo, input.path),
      sha,
      size: input.content.byteLength,
    };
  }

  async delete(path: string, sha: string): Promise<void> {
    // Best-effort: file yatim di repo tidak fatal
    try {
      const { token, owner, repo } = this.assertConfigured();
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const res = await this.fetchWithRetry(apiUrl, {
        method: 'DELETE',
        headers: this.headers(token),
        body: JSON.stringify({
          message: `chore(pronunciation): remove ${path}`,
          sha,
          branch: BRANCH,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn(
          { status: res.status, body: body.slice(0, 300), path },
          'GitHub pronunciation delete gagal (best-effort)',
        );
      }
    } catch (err) {
      logger.warn({ err, path }, 'GitHub pronunciation delete error (best-effort)');
    }
  }
}
