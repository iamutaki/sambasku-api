import type {
  PushMessage,
  PushSendResult,
  PushSenderPort,
} from '../application/ports/push-sender.port';
import { FcmPushSender, NoopPushSender } from './fcm-push.sender';

function readFirebaseEnv(): {
  projectId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
} {
  // Baca process.env saat kirim (bukan snapshot env.ts) - setara c.env di jnn_api.
  // worker.ts mengisi process.env dari bindings sebelum app di-import.
  return {
    projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.trim(),
  };
}

/**
 * Lazy sender - pola jnn_api: kredensial dibaca saat kirim, bukan di-freeze
 * saat composition root. Menghindari NoopPushSender terkunci jika snapshot
 * env sempat kosong di cold start.
 */
class LazyEnvPushSender implements PushSenderPort {
  get isConfigured(): boolean {
    const { projectId, clientEmail, privateKey } = readFirebaseEnv();
    return Boolean(projectId && clientEmail && privateKey);
  }

  async send(fcmTokens: string[], message: PushMessage): Promise<PushSendResult> {
    const { projectId, clientEmail, privateKey } = readFirebaseEnv();
    if (!projectId || !clientEmail || !privateKey) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'FCM NoopPushSender: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
          has_project: Boolean(projectId),
          has_email: Boolean(clientEmail),
          has_key: Boolean(privateKey),
        }),
      );
      return new NoopPushSender().send(fcmTokens, message);
    }
    return new FcmPushSender(projectId, clientEmail, privateKey).send(fcmTokens, message);
  }

  async sendToTopic(topic: string, message: PushMessage): Promise<boolean> {
    const { projectId, clientEmail, privateKey } = readFirebaseEnv();
    if (!projectId || !clientEmail || !privateKey) {
      return new NoopPushSender().sendToTopic(topic, message);
    }
    return new FcmPushSender(projectId, clientEmail, privateKey).sendToTopic(topic, message);
  }
}

/** Pilih FCM nyata kalau ketiga env terisi; selain itu no-op (dev lokal). */
export function createPushSender(): PushSenderPort {
  return new LazyEnvPushSender();
}
