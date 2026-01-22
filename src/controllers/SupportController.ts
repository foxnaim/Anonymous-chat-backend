import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AdminSettings } from "../models/AdminSettings";

/**
 * Получить публичную информацию о поддержке
 * Публичный endpoint - доступен без аутентификации
 */
export const getSupportInfo = asyncHandler(
  async (req: Request, res: Response) => {
    // Получаем первый доступный AdminSettings (обычно должен быть только один админ)
    // Или можно получить по какому-то дефолтному adminId
    const settings = await AdminSettings.findOne().lean().exec();

    res.json({
      success: true,
      data: {
        supportWhatsAppNumber: settings?.supportWhatsAppNumber || null,
      },
    });
  },
);
