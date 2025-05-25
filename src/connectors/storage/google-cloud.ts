import { Storage } from '@google-cloud/storage';
import { FileAction, StorageConnector } from '../../core/storage';

/**
 * Google Cloud Storage connector.
 */
export class GoogleCloudStorageConnector extends StorageConnector {
  private readonly client: Storage;

  constructor(projectId: string) {
    super();
    this.client = new Storage({
      projectId,
    });
  }

  override async getSignedUrl(
    bucketName: string,
    fileName: string,
    action: FileAction = 'read',
    expiry: number = 300,
    contentType?: string
  ) {
    const file = this.client.bucket(bucketName).file(fileName);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action,
      expires: Date.now() + expiry * 1000, // in milliseconds
      contentType,
    });
    return signedUrl;
  }

  override async getPublicUrl(bucketName: string, fileName: string) {
    const file = this.client.bucket(bucketName).file(fileName);
    return file.publicUrl();
  }

  override async changeVisibility(
    bucketName: string,
    fileName: string,
    accessible: boolean
  ) {
    const file = this.client.bucket(bucketName).file(fileName);
    if (accessible) {
      await file.makePublic();
    } else {
      await file.makePrivate();
    }
  }
}
