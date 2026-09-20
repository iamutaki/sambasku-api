import { env } from '@/shared/config/env';
import type { PushSenderPort } from '../application/ports/push-sender.port';
import { FcmPushSender, NoopPushSender } from './fcm-push.sender';

/** Pilih FCM nyata kalau ketiga env terisi; selain itu no-op (dev lokal). */
export function createPushSender(): PushSenderPort {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    return new FcmPushSender(projectId, clientEmail, privateKey);
  }
  return new NoopPushSender();
}
