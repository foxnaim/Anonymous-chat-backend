import { z } from 'zod';

// Валидация надежности пароля
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;

const passwordRefinement = (password: string) => {
  if (password.length < 8) {
    return { success: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { success: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { success: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { success: false, message: 'Password must contain at least one digit' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    return { success: false, message: 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)' };
  }
  return { success: true };
};

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters long')
      .refine((pwd) => /[A-Z]/.test(pwd), {
        message: 'Password must contain at least one uppercase letter',
      })
      .refine((pwd) => /[a-z]/.test(pwd), {
        message: 'Password must contain at least one lowercase letter',
      })
      .refine((pwd) => /[0-9]/.test(pwd), {
        message: 'Password must contain at least one digit',
      })
      .refine((pwd) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pwd), {
        message: 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)',
      }),
    name: z.string().optional(),
    role: z.enum(['user', 'company', 'admin']).optional(),
    companyName: z.string().optional(),
    companyCode: z.string().optional(),
  }),
});

export const verifyPasswordSchema = z.object({
  body: z.object({
    code: z.string().length(8, 'Company code must be exactly 8 characters'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters long')
      .refine((pwd) => /[A-Z]/.test(pwd), {
        message: 'Password must contain at least one uppercase letter',
      })
      .refine((pwd) => /[a-z]/.test(pwd), {
        message: 'Password must contain at least one lowercase letter',
      })
      .refine((pwd) => /[0-9]/.test(pwd), {
        message: 'Password must contain at least one digit',
      })
      .refine((pwd) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pwd), {
        message: 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)',
      }),
  }),
});

export const changeEmailSchema = z.object({
  body: z.object({
    newEmail: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Current password is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'New password must be at least 8 characters long')
      .refine((pwd) => /[A-Z]/.test(pwd), {
        message: 'New password must contain at least one uppercase letter',
      })
      .refine((pwd) => /[a-z]/.test(pwd), {
        message: 'New password must contain at least one lowercase letter',
      })
      .refine((pwd) => /[0-9]/.test(pwd), {
        message: 'New password must contain at least one digit',
      })
      .refine((pwd) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pwd), {
        message: 'New password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)',
      }),
  }),
});
