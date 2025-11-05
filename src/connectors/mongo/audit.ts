import mongoose from 'mongoose';
import { beanOf } from '../../core/ioc';
import { createLogger } from '../../core/logging';
import { Mongo, MongoBean } from './client';
import { ObjectId } from './types';

const logger = createLogger('mongo:audit');

export const DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX = '_aud';

/**
 * Audit operation types.
 */
export enum AuditOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
}

/**
 * Audit trail entry structure.
 */
export interface AuditEntry {
  /**
   * Reference to the original document ID.
   */
  documentId: ObjectId | string;
  /**
   * Type of operation performed.
   */
  operation: AuditOperation;
  /**
   * Document state before the change (null for CREATE).
   */
  before: any | null;
  /**
   * Document state after the change (null for DELETE).
   */
  after: any | null;
  /**
   * Changes made (for UPDATE operations).
   */
  changes?: Record<string, { old: any; new: any }>;
  /**
   * User or system that performed the operation.
   */
  actor?: {
    id?: number | string;
    email?: string;
    type?: string;
  };
  /**
   * Additional metadata.
   */
  metadata?: Record<string, any>;
  /**
   * Timestamp of the audit entry.
   */
  timestamp: Date;
  /**
   * IP address or request origin.
   */
  origin?: string;
}

/**
 * Audit configuration options.
 */
export interface AuditOptions {
  /**
   * Custom audit collection name (default: `${collectionName}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`).
   */
  auditCollection?: string;
  /**
   * Fields to exclude from audit tracking.
   */
  excludeFields?: string[];
  /**
   * Track only specific operations.
   */
  operations?: AuditOperation[];
  /**
   * Custom actor extractor function.
   */
  getActor?: () => AuditEntry['actor'] | Promise<AuditEntry['actor']>;
  /**
   * Custom metadata extractor function.
   */
  getMetadata?: () =>
    | Record<string, any>
    | Promise<Record<string, any>>
    | undefined;
  /**
   * Custom origin extractor function.
   */
  getOrigin?: () => string | Promise<string> | undefined;
  /**
   * Maximum number of audit entries to keep per document (0 = unlimited).
   */
  maxEntries?: number;
  /**
   * Auto-delete audit entries older than this (in days, 0 = never).
   */
  retentionDays?: number;
}

/**
 * Default audit schema.
 */
export const AuditSchema = new mongoose.Schema<AuditEntry>(
  {
    documentId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: Object.values(AuditOperation),
      required: true,
      index: true,
    },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    changes: { type: mongoose.Schema.Types.Mixed },
    actor: {
      id: { type: mongoose.Schema.Types.Mixed },
      email: { type: String },
      type: { type: String },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
    origin: { type: String },
  },
  {
    timestamps: false,
  }
);

/**
 * Calculate changes between two documents.
 */
function calculateChanges(
  before: any,
  after: any,
  excludeFields: string[] = []
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  for (const key of allKeys) {
    if (
      key === '_id' ||
      key === '__v' ||
      excludeFields.includes(key) ||
      key.startsWith('_')
    ) {
      continue;
    }

    const oldValue = before?.[key];
    const newValue = after?.[key];

    // Deep comparison for objects
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);

    if (oldStr !== newStr) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }

  return changes;
}

/**
 * Sanitize document for audit (remove sensitive/internal fields).
 */
function sanitizeDocument(doc: any, excludeFields: string[] = []): any {
  if (!doc) return null;

  const sanitized = doc.toObject ? doc.toObject() : { ...doc };

  // Remove version key and excluded fields
  delete sanitized.__v;
  excludeFields.forEach((field) => delete sanitized[field]);

  return sanitized;
}

/**
 * Create an audit entry.
 */
async function createAuditEntry(
  auditModel: mongoose.Model<AuditEntry>,
  entry: Omit<AuditEntry, 'timestamp'>
): Promise<void> {
  try {
    await auditModel.create({
      ...entry,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error(`Failed to create audit entry: ${err.message}`, err);
  }
}

/**
 * Attach audit trail middleware to a schema.
 */
export function attachAuditMiddleware<T>(
  schema: mongoose.Schema<T>,
  options: AuditOptions = {}
): void {
  const {
    excludeFields = [],
    operations = Object.values(AuditOperation),
    getActor,
    getMetadata,
    getOrigin,
    maxEntries = 0,
  } = options;

  // Track original document before updates/deletes
  schema.pre('findOneAndUpdate', async function () {
    if (!operations.includes(AuditOperation.UPDATE)) return;
    const doc = await this.model.findOne(this.getFilter());
    (this as any)._auditBefore = doc;
  });

  schema.pre('findOneAndDelete', async function () {
    if (!operations.includes(AuditOperation.DELETE)) return;
    const doc = await this.model.findOne(this.getFilter());
    (this as any)._auditBefore = doc;
  });

  schema.pre('deleteOne', async function () {
    if (!operations.includes(AuditOperation.DELETE)) return;
    const doc = await this.model.findOne(this.getFilter());
    (this as any)._auditBefore = doc;
  });

  schema.pre('deleteMany', async function () {
    if (!operations.includes(AuditOperation.DELETE)) return;
    const docs = await this.model.find(this.getFilter());
    (this as any)._auditBefore = docs;
  });

  // Post-save: CREATE operation
  schema.post('save', async function (doc: any) {
    if (!operations.includes(AuditOperation.CREATE) && !doc.isNew) return;
    if (!operations.includes(AuditOperation.UPDATE) && doc.isNew === false)
      return;

    const operation = doc.isNew ? AuditOperation.CREATE : AuditOperation.UPDATE;
    const auditCollectionName =
      options.auditCollection ||
      `${this.collection.name}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

    try {
      const mongo = beanOf<Mongo>(Mongo);
      const auditModel = mongo.model<AuditEntry>(
        `${auditCollectionName}_model`,
        AuditSchema,
        auditCollectionName
      );

      const after = sanitizeDocument(doc, excludeFields);
      const before =
        operation === AuditOperation.CREATE
          ? null
          : doc.$locals?.before || null;

      const entry: Omit<AuditEntry, 'timestamp'> = {
        documentId: doc._id,
        operation,
        before,
        after,
        changes:
          operation === AuditOperation.UPDATE
            ? calculateChanges(before, after, excludeFields)
            : undefined,
        actor: getActor ? await getActor() : undefined,
        metadata: getMetadata ? await getMetadata() : undefined,
        origin: getOrigin ? await getOrigin() : undefined,
      };

      await createAuditEntry(auditModel, entry);

      // Cleanup old entries if maxEntries is set
      if (maxEntries > 0) {
        const entries = await auditModel
          .find({ documentId: doc._id })
          .sort({ timestamp: -1 })
          .skip(maxEntries);

        if (entries.length > 0) {
          const idsToDelete = entries.map((e) => e._id);
          await auditModel.deleteMany({ _id: { $in: idsToDelete } });
        }
      }
    } catch (err) {
      logger.error(`Audit trail error on ${operation}: ${err.message}`, err);
    }
  });

  // Post-update: UPDATE operation
  schema.post('findOneAndUpdate', async function (doc: any) {
    if (!operations.includes(AuditOperation.UPDATE) || !doc) return;

    const auditCollectionName =
      options.auditCollection ||
      `${doc.collection.name}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

    try {
      const mongo = beanOf<Mongo>(Mongo);
      const auditModel = mongo.model<AuditEntry>(
        `${auditCollectionName}_model`,
        AuditSchema,
        auditCollectionName
      );

      const before = sanitizeDocument(
        (this as any)._auditBefore,
        excludeFields
      );
      const after = sanitizeDocument(doc, excludeFields);

      const entry: Omit<AuditEntry, 'timestamp'> = {
        documentId: doc._id,
        operation: AuditOperation.UPDATE,
        before,
        after,
        changes: calculateChanges(before, after, excludeFields),
        actor: getActor ? await getActor() : undefined,
        metadata: getMetadata ? await getMetadata() : undefined,
        origin: getOrigin ? await getOrigin() : undefined,
      };

      await createAuditEntry(auditModel, entry);

      if (maxEntries > 0) {
        const entries = await auditModel
          .find({ documentId: doc._id })
          .sort({ timestamp: -1 })
          .skip(maxEntries);

        if (entries.length > 0) {
          const idsToDelete = entries.map((e) => e._id);
          await auditModel.deleteMany({ _id: { $in: idsToDelete } });
        }
      }
    } catch (err) {
      logger.error(`Audit trail error on UPDATE: ${err.message}`, err);
    }
  });

  // Post-delete: DELETE operation
  schema.post('findOneAndDelete', async function (doc: any) {
    if (!operations.includes(AuditOperation.DELETE) || !doc) return;
    await handleDelete(
      doc,
      options,
      (this as any)._auditBefore,
      excludeFields,
      maxEntries,
      getActor,
      getMetadata,
      getOrigin
    );
  });

  schema.post('deleteOne', async function (result: any) {
    if (!operations.includes(AuditOperation.DELETE)) return;
    const doc = (this as any)._auditBefore;
    if (doc) {
      await handleDelete(
        doc,
        options,
        doc,
        excludeFields,
        maxEntries,
        getActor,
        getMetadata,
        getOrigin
      );
    }
  });

  schema.post('deleteMany', async function (result: any) {
    if (!operations.includes(AuditOperation.DELETE)) return;
    const docs = (this as any)._auditBefore || [];
    for (const doc of docs) {
      await handleDelete(
        doc,
        options,
        doc,
        excludeFields,
        maxEntries,
        getActor,
        getMetadata,
        getOrigin
      );
    }
  });
}

/**
 * Handle delete operation audit.
 */
async function handleDelete(
  doc: any,
  options: AuditOptions,
  auditBefore: any,
  excludeFields: string[],
  maxEntries: number,
  getActor?: () => AuditEntry['actor'] | Promise<AuditEntry['actor']>,
  getMetadata?: () =>
    | Record<string, any>
    | Promise<Record<string, any>>
    | undefined,
  getOrigin?: () => string | Promise<string> | undefined
): Promise<void> {
  const auditCollectionName =
    options.auditCollection ||
    `${doc.collection.name}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

  try {
    const mongo = beanOf<Mongo>(Mongo);
    const auditModel = mongo.model<AuditEntry>(
      `${auditCollectionName}_model`,
      AuditSchema,
      auditCollectionName
    );

    const before = sanitizeDocument(auditBefore, excludeFields);

    const entry: Omit<AuditEntry, 'timestamp'> = {
      documentId: doc._id,
      operation: AuditOperation.DELETE,
      before,
      after: null,
      actor: getActor ? await getActor() : undefined,
      metadata: getMetadata ? await getMetadata() : undefined,
      origin: getOrigin ? await getOrigin() : undefined,
    };

    await createAuditEntry(auditModel, entry);

    if (maxEntries > 0) {
      const entries = await auditModel
        .find({ documentId: doc._id })
        .sort({ timestamp: -1 })
        .skip(maxEntries);

      if (entries.length > 0) {
        const idsToDelete = entries.map((e) => e._id);
        await auditModel.deleteMany({ _id: { $in: idsToDelete } });
      }
    }
  } catch (err) {
    logger.error(`Audit trail error on DELETE: ${err.message}`, err);
  }
}

/**
 * Query audit history for a document.
 */
export async function getAuditHistory(
  documentId: string | ObjectId,
  collectionName: string,
  options?: {
    /**
     * Custom audit collection name.
     */
    auditCollection?: string;
    /**
     * Filter by operation type.
     */
    operations?: AuditOperation[];
    /**
     * Limit number of entries.
     */
    limit?: number;
    /**
     * Skip entries.
     */
    skip?: number;
    /**
     * Sort order (1 = ascending, -1 = descending).
     */
    sort?: 1 | -1;
    /**
     * Mongo instance to use.
     */
    use?: MongoBean;
  }
): Promise<AuditEntry[]> {
  const {
    auditCollection,
    operations,
    limit = 100,
    skip = 0,
    sort = -1,
    use = Mongo,
  } = options || {};

  const auditCollectionName =
    auditCollection ||
    `${collectionName}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

  try {
    const mongo = use instanceof Mongo ? use : beanOf<Mongo>(use);
    const auditModel = mongo.model<AuditEntry>(
      `${auditCollectionName}_model`,
      AuditSchema,
      auditCollectionName
    );

    const query: any = { documentId };
    if (operations?.length) {
      query.operation = { $in: operations };
    }

    return await auditModel
      .find(query)
      .sort({ timestamp: sort })
      .limit(limit)
      .skip(skip)
      .lean();
  } catch (err) {
    logger.error(`Failed to get audit history: ${err.message}`, err);
    return [];
  }
}

/**
 * Restore a document to a previous state from audit history.
 */
export async function restoreFromAudit(
  documentId: string | ObjectId,
  model: mongoose.Model<any>,
  auditTimestamp: Date,
  options?: {
    /**
     * Custom audit collection name.
     */
    auditCollection?: string;
    /**
     * Mongo instance to use.
     */
    use?: MongoBean;
  }
): Promise<any> {
  const { auditCollection, use = Mongo } = options || {};
  const collectionName = model.collection.name;
  const auditCollectionName =
    auditCollection ||
    `${collectionName}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

  try {
    const mongo = use instanceof Mongo ? use : beanOf<Mongo>(use);
    const auditModel = mongo.model<AuditEntry>(
      `${auditCollectionName}_model`,
      AuditSchema,
      auditCollectionName
    );

    // Find the audit entry at the specified timestamp
    const auditEntry = await auditModel
      .findOne({
        documentId,
        timestamp: { $lte: auditTimestamp },
      })
      .sort({ timestamp: -1 });

    if (!auditEntry) {
      throw new Error('No audit entry found for the specified timestamp');
    }

    // Use the 'after' state if available, otherwise 'before'
    const stateToRestore = auditEntry.after || auditEntry.before;

    if (!stateToRestore) {
      throw new Error('No valid state found in audit entry');
    }

    // Update the document
    const { _id, ...restoreData } = stateToRestore;
    const restored = await model.findByIdAndUpdate(
      documentId,
      { $set: restoreData },
      { new: true }
    );

    // Create a RESTORE audit entry
    await auditModel.create({
      documentId,
      operation: AuditOperation.RESTORE,
      before: await model.findById(documentId).lean(),
      after: restored?.toObject(),
      metadata: {
        restoredFrom: auditTimestamp,
        auditEntryId: auditEntry._id,
      },
      timestamp: new Date(),
    });

    return restored;
  } catch (err) {
    logger.error(`Failed to restore from audit: ${err.message}`, err);
    throw err;
  }
}

/**
 * Clean up old audit entries based on retention policy.
 */
export async function cleanupAuditEntries(
  collectionName: string,
  retentionDays: number,
  options?: {
    /**
     * Custom audit collection name.
     */
    auditCollection?: string;
    /**
     * Mongo instance to use.
     */
    use?: MongoBean;
  }
): Promise<number> {
  if (retentionDays <= 0) return 0;

  const { auditCollection, use = Mongo } = options || {};
  const auditCollectionName =
    auditCollection ||
    `${collectionName}${DEFAULT_AUDIT_COLLECTION_NAME_SUFFIX}`;

  try {
    const mongo = use instanceof Mongo ? use : beanOf<Mongo>(use);
    const auditModel = mongo.model<AuditEntry>(
      `${auditCollectionName}_model`,
      AuditSchema,
      auditCollectionName
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await auditModel.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    return result.deletedCount || 0;
  } catch (err) {
    logger.error(`Failed to cleanup audit entries: ${err.message}`, err);
    return 0;
  }
}
