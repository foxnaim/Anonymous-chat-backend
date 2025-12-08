import { Schema, model } from 'mongoose';
import { BaseDocument, baseSchemaOptions } from './BaseModel';

export interface IExample extends BaseDocument {
  name: string;
  description?: string;
  isActive: boolean;
}

const ExampleSchema = new Schema<IExample>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  baseSchemaOptions
);

export const Example = model<IExample>('Example', ExampleSchema);
