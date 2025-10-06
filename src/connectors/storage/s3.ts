import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  PutObjectAclCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileAction, StorageConnector } from '../../core/storage';

export type S3Options = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * AWS S3 connector.
 */
export class S3Connector extends StorageConnector {
  private readonly client: S3Client;

  constructor(options: S3Options) {
    super();
    this.client = new S3Client({
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  override async getSignedUrl(
    bucketName: string,
    fileName: string,
    action: FileAction = 'read',
    expiry: number = 300,
    contentType?: string
  ) {
    let command: GetObjectCommand | PutObjectCommand | DeleteObjectCommand;
    switch (action) {
      case 'read':
        command = new GetObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          ResponseContentType: contentType,
        });
        break;
      case 'write':
        command = new PutObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          ContentType: contentType,
        });
        break;
      case 'delete':
        command = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: fileName,
        });
        break;
    }
    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: Date.now() / 1000 + expiry,
    });
    return signedUrl;
  }

  override async getPublicUrl(bucketName: string, fileName: string) {
    return `https://${bucketName}.s3.amazonaws.com/${fileName}`;
  }

  override async changeVisibility(
    bucketName: string,
    fileName: string,
    accessible: boolean
  ) {
    const command = new PutObjectAclCommand({
      Bucket: bucketName,
      Key: fileName,
      ACL: accessible ? 'public-read' : 'private',
    });
    await this.client.send(command);
  }
}
