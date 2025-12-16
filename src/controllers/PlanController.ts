import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { SubscriptionPlan, ISubscriptionPlan } from '../models/SubscriptionPlan';
import { cache } from '../utils/cache';

// Тип для lean() результата - упрощенный тип для кэширования
type PlanLean = ISubscriptionPlan;

// Настройки бесплатного плана
let freePlanSettings = {
  messagesLimit: 10,
  storageLimit: 1,
  freePeriodDays: 60,
};

export const getAllPlans = asyncHandler(async (_req: Request, res: Response) => {
  // Проверяем кэш
  const cacheKey = 'plans:all';
  const cachedPlans = cache.get<PlanLean[]>(cacheKey);
  if (cachedPlans) {
    res.json({
      success: true,
      data: cachedPlans,
    });
    return;
  }

  // Оптимизация: используем lean() и select для производительности
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let plans: any[] = await SubscriptionPlan.find()
    .select('-__v')
    .sort({ price: 1 })
    .lean()
    .exec();

  // Если планов нет, создаем дефолтные
  if (plans.length === 0) {
    const defaultPlans = [
      {
        id: 'free',
        name: { ru: 'Бесплатный', en: 'Free', kk: 'Тегін' },
        price: 0,
        messagesLimit: freePlanSettings.messagesLimit,
        storageLimit: freePlanSettings.storageLimit,
        isFree: true,
        freePeriodDays: freePlanSettings.freePeriodDays,
        features: [
          {
            ru: `До ${freePlanSettings.messagesLimit} сообщений в месяц`,
            en: `Up to ${freePlanSettings.messagesLimit} messages per month`,
            kk: `Айына ${freePlanSettings.messagesLimit} хабарламаға дейін`,
          },
          { ru: 'Приём сообщений', en: 'Receive messages', kk: 'Хабарламаларды қабылдау' },
          { ru: 'Просмотр сообщений', en: 'View messages', kk: 'Хабарламаларды көру' },
        ],
      },
      {
        id: 'standard',
        name: { ru: 'Стандарт', en: 'Standard', kk: 'Стандарт' },
        price: 2999,
        messagesLimit: 100,
        storageLimit: 10,
        features: [
          {
            ru: 'До 100 сообщений в месяц',
            en: 'Up to 100 messages per month',
            kk: 'Айына 100 хабарламаға дейін',
          },
        ],
      },
      {
        id: 'pro',
        name: { ru: 'Про', en: 'Pro', kk: 'Про' },
        price: 9999,
        messagesLimit: 500,
        storageLimit: 50,
        features: [
          {
            ru: 'До 500 сообщений в месяц',
            en: 'Up to 500 messages per month',
            kk: 'Айына 500 хабарламаға дейін',
          },
        ],
      },
    ];

    await SubscriptionPlan.insertMany(defaultPlans);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plans = await SubscriptionPlan.find().select('-__v').sort({ price: 1 }).lean().exec();
  }

  // Обновляем freePeriodDays для бесплатного плана из текущих настроек
  // Это гарантирует, что всегда используется актуальное значение из админки
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const freePlanIndex = plans.findIndex((p: any) => p.id === 'free' || p.isFree === true);
  if (freePlanIndex !== -1 && freePlanIndex < plans.length) {
    // Обновляем в базе данных (нужно найти документ, а не lean объект)
    const freePlanDoc = await SubscriptionPlan.findOne({
      $or: [{ id: 'free' }, { isFree: true }],
    });
    if (freePlanDoc) {
      freePlanDoc.freePeriodDays = freePlanSettings.freePeriodDays;
      freePlanDoc.messagesLimit = freePlanSettings.messagesLimit;
      await freePlanDoc.save();

      // Обновляем в массиве для ответа
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const planToUpdate = plans[freePlanIndex];
      if (planToUpdate) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        planToUpdate.freePeriodDays = freePlanSettings.freePeriodDays;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        planToUpdate.messagesLimit = freePlanSettings.messagesLimit;
      }
    }
  }

  // Кэшируем на 5 минут
  cache.set(cacheKey, plans, 5 * 60 * 1000);

  res.json({
    success: true,
    data: plans,
  });
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут создавать планы
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as {
    name?: string;
    price?: number;
    messagesLimit?: number;
    storageLimit?: number;
    features?: string[];
    isFree?: boolean;
    freePeriodDays?: number;
  };
  const { name, price, messagesLimit, storageLimit, features, isFree, freePeriodDays } = body;

  const planId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const plan = await SubscriptionPlan.create({
    id: planId,
    name,
    price,
    messagesLimit,
    storageLimit,
    features,
    isFree,
    freePeriodDays,
  });

  // Инвалидируем кэш планов
  cache.delete('plans:all');

  res.status(201).json({
    success: true,
    data: plan,
  });
});

// eslint-disable-next-line @typescript-eslint/require-await
export const getFreePlanSettings = asyncHandler(async (_req: Request, res: Response) => {
  // Проверяем кэш
  const cacheKey = 'plans:free-settings';
  const cached = cache.get<typeof freePlanSettings>(cacheKey);
  if (cached) {
    res.json({
      success: true,
      data: cached,
    });
    return;
  }

  // Кэшируем на 1 минуту (настройки могут часто меняться)
  cache.set(cacheKey, freePlanSettings, 60 * 1000);

  res.json({
    success: true,
    data: freePlanSettings,
  });
});

// eslint-disable-next-line @typescript-eslint/require-await
export const updateFreePlanSettings = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут обновлять настройки
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as { messagesLimit?: number; freePeriodDays?: number };
  const { messagesLimit, freePeriodDays } = body;

  // Обновляем messagesLimit и freePeriodDays (настраиваются админом), storageLimit остается фиксированным
  freePlanSettings = {
    ...freePlanSettings,
    messagesLimit: messagesLimit !== undefined ? messagesLimit : freePlanSettings.messagesLimit,
    freePeriodDays: freePeriodDays !== undefined ? freePeriodDays : freePlanSettings.freePeriodDays,
  };

  // Инвалидируем кэш
  cache.delete('plans:free-settings');
  cache.delete('plans:all'); // Также инвалидируем кэш всех планов

  res.json({
    success: true,
    data: freePlanSettings,
  });
});
