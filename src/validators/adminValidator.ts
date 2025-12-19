import { z } from 'zod';

export const createAdminSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(1, 'Name is required'),
    role: z.enum(['admin', 'super_admin']).optional(),
  }),
});

export const updateAdminSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Admin ID is required'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    role: z.enum(['admin', 'super_admin']).optional(),
  }),
});

export const updateAdminSettingsSchema = z.object({
  body: z.object({
    fullscreenMode: z.boolean().optional(),
    language: z.enum(['ru', 'en', 'kk']).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    itemsPerPage: z.number().int().min(5).max(100).optional(),
    notificationsEnabled: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
  }),
});
