import { z } from "zod";

export const createMessageSchema = z.object({
  body: z.object({
    companyCode: z
      .string()
      .length(8, "Company code must be exactly 8 characters"),
    type: z.enum(["complaint", "praise", "suggestion"]),
    content: z
      .string()
      .min(1, "Content is required")
      .max(5000, "Content is too long"),
  }),
});

export const updateMessageStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Message ID is required"),
  }),
  body: z.object({
    status: z.enum(["Новое", "В работе", "Решено", "Отклонено", "Спам"]),
    response: z.string().max(2000, "Response is too long").optional(),
  }),
});

export const getMessagesSchema = z.object({
  query: z.object({
    companyCode: z
      .string()
      .length(8, "Company code must be exactly 8 characters")
      .optional(),
    messageId: z
      .string()
      .min(1, "Message ID must not be empty")
      .optional(),
  }),
});

export const getMessageByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Message ID is required"),
  }),
});

export const moderateMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Message ID is required"),
  }),
  body: z.object({
    action: z.enum(["approve", "reject"], {
      errorMap: () => ({ message: 'Action must be "approve" or "reject"' }),
    }),
  }),
});
