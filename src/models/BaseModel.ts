import { Document, Model, Schema } from 'mongoose';

export interface BaseDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
}

export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false,
};


