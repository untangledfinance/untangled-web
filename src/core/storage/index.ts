import { notImplementedYet } from '../types';

export type FileAction = 'read' | 'write' | 'delete';

/**
 * Provides functionalities to interact with an external storage.
 */
export class StorageConnector {
  /**
   * Creates a signed URL to interact with a given file.
   * @param bucketName name of the bucket.
   * @param fileName name of the file.
   * @param action action for interaction.
   * @param expiry the number of seconds after that the action will be expired.
   */
  getSignedUrl(
    bucketName: string,
    fileName: string,
    action: FileAction,
    expiry: number,
    contentType?: string
  ): Promise<string> {
    throw notImplementedYet();
  }
  /**
   * Retrieves the publicly-accessible URL of a given file.
   * @param bucketName name of the bucket.
   * @param fileName name of the file.
   */
  getPublicUrl(bucketName: string, fileName: string): Promise<string> {
    throw notImplementedYet();
  }
  /**
   * Changes the visibility of a given file.
   * @param bucketName name of the bucket.
   * @param fileName name of the file.
   * @param accessible to indicate whether or not the file is publicly-accessible.
   */
  changeVisibility(
    bucketName: string,
    fileName: string,
    accessible: boolean
  ): Promise<void> {
    throw notImplementedYet();
  }
}
