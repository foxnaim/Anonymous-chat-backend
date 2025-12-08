import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().optional(),
    role: z.enum(['user', 'company', 'admin']).optional(),
  }),
});

export const verifyPasswordSchema = z.object({
  body: z.object({
    code: z.string().length(8, 'Company code must be exactly 8 characters'),
    password: z.string().min(1, 'Password is required'),
  }),
});
