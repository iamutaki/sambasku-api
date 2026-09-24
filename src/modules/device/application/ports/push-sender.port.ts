export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  success: string[];
  failed: string[];
}

/** Port kirim push (FCM). Impl no-op jika kredensial belum di-set. */
export interface PushSenderPort {
  readonly isConfigured: boolean;
  send(fcmTokens: string[], message: PushMessage): Promise<PushSendResult>;
  /** Kirim ke FCM topic (1 request). Return false jika gagal / no-op. */
  sendToTopic(topic: string, message: PushMessage): Promise<boolean>;
}
