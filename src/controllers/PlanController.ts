import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError, ErrorCode } from "../utils/AppError";
import {
  SubscriptionPlan,
  ISubscriptionPlan,
} from "../models/SubscriptionPlan";
import { FreePlanSettings } from "../models/FreePlanSettings";
import { Company } from "../models/Company";
import { cache, CacheManager } from "../utils/cacheRedis";

// Тип для lean() результата - упрощенный тип для кэширования
type PlanLean = ISubscriptionPlan;

// Функция для получения настроек бесплатного плана из БД
// Создает дефолтные настройки, если их еще нет
async function getFreePlanSettingsFromDB(): Promise<{
  messagesLimit: number;
  storageLimit: number;
  freePeriodDays: number;
}> {
  let settings = await FreePlanSettings.findOne({ settingsId: "default" });

  if (!settings) {
    // Создаем дефолтные настройки при первом запуске
    settings = await FreePlanSettings.create({
      settingsId: "default",
      messagesLimit: 10,
      storageLimit: 1,
      freePeriodDays: 60,
    });
  }

  return {
    messagesLimit: settings.messagesLimit,
    storageLimit: settings.storageLimit,
    freePeriodDays: settings.freePeriodDays,
  };
}

export const getAllPlans = asyncHandler(
  async (_req: Request, res: Response) => {
    // Проверяем кэш
    const cacheKey = "plans:all";
    const cachedPlans = await cache.get<PlanLean[]>(cacheKey);
    if (cachedPlans) {
      res.json({
        success: true,
        data: cachedPlans,
      });
      return;
    }

    // Получаем настройки бесплатного плана из БД
    const freePlanSettings = await getFreePlanSettingsFromDB();

    // Оптимизация: используем lean() и select для производительности
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let plans: any[] = await SubscriptionPlan.find()
      .select("-__v")
      .sort({ price: 1 })
      .lean()
      .exec();

    // Если планов нет, создаем дефолтные
    if (plans.length === 0) {
      const defaultPlans = [
        {
          id: "free",
          name: { ru: "Пробный", en: "Trial", kk: "Сынақ" },
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
            {
              ru: "Приём сообщений",
              en: "Receive messages",
              kk: "Хабарламаларды қабылдау",
            },
            {
              ru: "Просмотр сообщений",
              en: "View messages",
              kk: "Хабарламаларды көру",
            },
          ],
        },
        {
          id: "standard",
          name: { ru: "Стандарт", en: "Standard", kk: "Стандарт" },
          price: 2999,
          messagesLimit: 100,
          storageLimit: 10,
          features: [
            {
              ru: "До 100 сообщений в месяц",
              en: "Up to 100 messages per month",
              kk: "Айына 100 хабарламаға дейін",
            },
          ],
        },
        {
          id: "pro",
          name: { ru: "Про", en: "Pro", kk: "Про" },
          price: 9999,
          messagesLimit: 500,
          storageLimit: 50,
          features: [
            {
              ru: "До 500 сообщений в месяц",
              en: "Up to 500 messages per month",
              kk: "Айына 500 хабарламаға дейін",
            },
          ],
        },
      ];

      await SubscriptionPlan.insertMany(defaultPlans);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plans = await SubscriptionPlan.find()
        .select("-__v")
        .sort({ price: 1 })
        .lean()
        .exec();
    }

    // Обновляем freePeriodDays для бесплатного плана из текущих настроек
    // Это гарантирует, что всегда используется актуальное значение из админки
    const freePlanIndex = plans.findIndex(
      (p: PlanLean) => p.id === "free" || p.isFree === true,
    );
    if (freePlanIndex !== -1 && freePlanIndex < plans.length) {
      // Обновляем в базе данных (нужно найти документ, а не lean объект)
      const freePlanDoc = await SubscriptionPlan.findOne({
        $or: [{ id: "free" }, { isFree: true }],
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

    // Получаем все компании для подсчета статистики по тарифам
    const companies = await Company.find()
      .select("plan trialEndDate status")
      .lean()
      .exec();

    // Функция для получения имени плана (поддержка разных форматов)
    const getPlanName = (plan: PlanLean): string => {
      if (typeof plan.name === "string") {
        return plan.name;
      }
      if (plan.name && typeof plan.name === "object") {
        return plan.name.ru || plan.name.en || plan.name.kk || "";
      }
      return "";
    };

    // Функция для вычисления дней до окончания тарифа
    const calculateDaysUntilExpiry = (trialEndDate?: string): number | null => {
      if (!trialEndDate) return null;
      try {
        const endDate = new Date(trialEndDate);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
      } catch {
        return null;
      }
    };

    // Подсчитываем количество компаний на каждом тарифе и вычисляем среднее время до окончания
    const planStats = new Map<string, { count: number; totalDaysUntilExpiry: number; companiesWithExpiry: number }>();

    companies.forEach((company) => {
      const companyPlan = company.plan || "Бесплатный";
      
      // Находим соответствующий план в списке планов
      const matchingPlan = plans.find((p: PlanLean) => {
        const planName = getPlanName(p);
        return planName === companyPlan || 
               (typeof p.name === "object" && (
                 p.name.ru === companyPlan || 
                 p.name.en === companyPlan || 
                 p.name.kk === companyPlan
               ));
      });

      // Используем ID плана или имя плана как ключ
      const planKey = matchingPlan ? matchingPlan.id : companyPlan;

      if (!planStats.has(planKey)) {
        planStats.set(planKey, { count: 0, totalDaysUntilExpiry: 0, companiesWithExpiry: 0 });
      }

      const stats = planStats.get(planKey)!;
      stats.count += 1;

      // Вычисляем дни до окончания для компаний с trialEndDate
      if (company.trialEndDate) {
        const daysUntilExpiry = calculateDaysUntilExpiry(company.trialEndDate);
        if (daysUntilExpiry !== null) {
          stats.totalDaysUntilExpiry += daysUntilExpiry;
          stats.companiesWithExpiry += 1;
        }
      }
    });

    // Добавляем статистику к каждому плану
    const plansWithStats = plans.map((plan: PlanLean) => {
      const planKey = plan.id;
      const stats = planStats.get(planKey) || { count: 0, totalDaysUntilExpiry: 0, companiesWithExpiry: 0 };
      
      // Вычисляем среднее количество дней до окончания
      const avgDaysUntilExpiry = stats.companiesWithExpiry > 0
        ? Math.round(stats.totalDaysUntilExpiry / stats.companiesWithExpiry)
        : null;

      return {
        ...plan,
        companiesCount: stats.count,
        avgDaysUntilExpiry,
      };
    });

    // Кэшируем на 30 минут (планы меняются редко)
    await cache.set(cacheKey, plansWithStats, CacheManager.getTTL("company"));

    res.json({
      success: true,
      data: plansWithStats,
    });
  },
);

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут создавать планы
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
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
  const {
    name,
    price,
    messagesLimit,
    storageLimit,
    features,
    isFree,
    freePeriodDays,
  } = body;

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
  void cache.delete("plans:all");

  res.status(201).json({
    success: true,
    data: plan,
  });
});

export const getFreePlanSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    // Проверяем кэш
    const cacheKey = "plans:free-settings";
    const cached = await cache.get<{
      messagesLimit: number;
      storageLimit: number;
      freePeriodDays: number;
    }>(cacheKey);
    if (cached) {
      res.json({
        success: true,
        data: cached,
      });
      return;
    }

    // Получаем настройки из БД
    const settings = await getFreePlanSettingsFromDB();

    // Кэшируем на 5 минут (статистика)
    await cache.set(cacheKey, settings, CacheManager.getTTL("stats"));

    res.json({
      success: true,
      data: settings,
    });
  },
);

export const updateFreePlanSettings = asyncHandler(
  async (req: Request, res: Response) => {
    // Только админы могут обновлять настройки
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const body = req.body as {
      messagesLimit?: number;
      storageLimit?: number;
      freePeriodDays?: number;
    };
    const { messagesLimit, storageLimit, freePeriodDays } = body;

    // Получаем текущие настройки из БД
    let settings = await FreePlanSettings.findOne({ settingsId: "default" });

    if (!settings) {
      // Создаем новые настройки, если их еще нет
      settings = await FreePlanSettings.create({
        settingsId: "default",
        messagesLimit: messagesLimit ?? 10,
        storageLimit: storageLimit ?? 1,
        freePeriodDays: freePeriodDays ?? 60,
      });
    } else {
      // Обновляем только переданные поля
      if (messagesLimit !== undefined) {
        settings.messagesLimit = messagesLimit;
      }
      if (storageLimit !== undefined) {
        settings.storageLimit = storageLimit;
      }
      if (freePeriodDays !== undefined) {
        settings.freePeriodDays = freePeriodDays;
      }
      await settings.save();
    }

    // Обновляем бесплатный план в SubscriptionPlan, если он существует
    const freePlan = await SubscriptionPlan.findOne({
      $or: [{ id: "free" }, { isFree: true }],
    });
    if (freePlan) {
      freePlan.messagesLimit = settings.messagesLimit;
      freePlan.freePeriodDays = settings.freePeriodDays;
      await freePlan.save();
    }

    // Инвалидируем кэш
    void cache.delete("plans:free-settings");
    void cache.delete("plans:all"); // Также инвалидируем кэш всех планов

    const responseData = {
      messagesLimit: settings.messagesLimit,
      storageLimit: settings.storageLimit,
      freePeriodDays: settings.freePeriodDays,
    };

    res.json({
      success: true,
      data: responseData,
    });
  },
);
