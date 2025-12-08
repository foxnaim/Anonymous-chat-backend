import { z } from 'zod';

export const createExampleSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
    description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateExampleSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'ID is required'),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const getExampleByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'ID is required'),
  }),
});

export const deleteExampleSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'ID is required'),
  }),
});
