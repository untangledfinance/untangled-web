import mongoose from 'mongoose';

/**
 * A generic {@link mongoose.Model} type (mirrored from `mongoose` package).
 */
export type TModel<TSchema extends mongoose.Schema = any> = mongoose.Model<
  mongoose.InferSchemaType<TSchema>,
  mongoose.ObtainSchemaGeneric<TSchema, 'TQueryHelpers'>,
  mongoose.ObtainSchemaGeneric<TSchema, 'TInstanceMethods'>,
  mongoose.ObtainSchemaGeneric<TSchema, 'TVirtuals'>,
  mongoose.HydratedDocument<
    mongoose.InferSchemaType<TSchema>,
    mongoose.ObtainSchemaGeneric<TSchema, 'TVirtuals'> &
      mongoose.ObtainSchemaGeneric<TSchema, 'TInstanceMethods'>,
    mongoose.ObtainSchemaGeneric<TSchema, 'TQueryHelpers'>
  >,
  TSchema
> &
  mongoose.ObtainSchemaGeneric<TSchema, 'TStaticMethods'>;

/**
 * @see mongoose.Types.ObjectId
 */
export class ObjectId extends mongoose.Types.ObjectId {}
