import { logger } from '@/shared/logging/logger';
import type { PushMessage, PushSendResult, PushSenderPort } from '../application/ports/push-sender.port';

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeBase64url(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function signRs256(data: string, privateKeyPem: string): Promise<string> {
  const keyData = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(data),
  );
  return base64url(new Uint8Array(signature));
}

async function getFcmAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${encodeBase64url(JSON.stringify(header))}.${encodeBase64url(JSON.stringify(claim))}`;
  const signature = await signRs256(signingInput, privateKey);
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('FCM OAuth token kosong');
  }
  return data.access_token;
}

async function pushOne(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  message: PushMessage,
): Promise<boolean> {
  const payload: {
    message: {
      token: string;
      notification: { title: string; body: string };
      data?: Record<string, string>;
    };
  } = {
    message: {
      token: fcmToken,
      notification: { title: message.title, body: message.body },
    },
  };
  if (message.data && Object.keys(message.data).length > 0) {
    payload.message.data = message.data;
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (res.ok) return true;
  const errBody = await res.text();
  logger.warn(
    { status: res.status, body: errBody, token_prefix: fcmToken.slice(0, 16) },
    'fcm push failed',
  );
  return false;
}

export class FcmPushSender implements PushSenderPort {
  readonly isConfigured = true;

  constructor(
    private readonly projectId: string,
    private readonly clientEmail: string,
    private readonly privateKey: string,
  ) {}

  async send(fcmTokens: string[], message: PushMessage): Promise<PushSendResult> {
    if (fcmTokens.length === 0) return { success: [], failed: [] };
    const accessToken = await getFcmAccessToken(this.clientEmail, this.privateKey);
    const outcomes = await Promise.all(
      fcmTokens.map((token) =>
        pushOne(accessToken, this.projectId, token, message).then((ok) =>
          ok ? token : null,
        ),
      ),
    );
    const success = outcomes.filter((t): t is string => t !== null);
    const failed = fcmTokens.filter((t) => !success.includes(t));
    return { success, failed };
  }
}

/** No-op bila FIREBASE_* belum di-set — boot tetap aman. */
export class NoopPushSender implements PushSenderPort {
  readonly isConfigured = false;

  async send(fcmTokens: string[], _message: PushMessage): Promise<PushSendResult> {
    return { success: [], failed: [...fcmTokens] };
  }
}
