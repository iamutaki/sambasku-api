import type { ImageStoragePort, UploadCredentials } from '../ports/image-storage.port';

export class CreateUploadCredentialsUseCase {
  constructor(
    private deps: {
      imageStorage: ImageStoragePort;
      defaultFolder: string;
    },
  ) {}

  async execute(folder?: string): Promise<UploadCredentials> {
    return this.deps.imageStorage.createUploadCredentials(folder ?? this.deps.defaultFolder);
  }
}
