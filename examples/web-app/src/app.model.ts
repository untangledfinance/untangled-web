import mongoose from 'mongoose';
import { Model } from 'untangled-web/connectors/mongo';

export const User = new mongoose.Schema({
  username: String,
  email: String,
  phoneNumber: String,
  dateOfBirth: Date,
  active: Boolean,
});

export default Model('User', User, 'users');
