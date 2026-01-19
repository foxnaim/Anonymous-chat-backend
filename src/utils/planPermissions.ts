import { ICompany } from "../models/Company";
import { SubscriptionPlan } from "../models/SubscriptionPlan";

export interface PlanPermissions {
  canReply: boolean;
  canChangeStatus: boolean;
  canViewBasicAnalytics: boolean;
  canViewExtendedAnalytics: boolean;
  canViewReports: boolean;
  canViewGrowth: boolean;
  canViewTeamMood: boolean;
  isReadOnly: boolean;
}

/**
 * Определяет план компании по имени плана
 */
export async function getPlanById(planName: string): Promise<{
  id: string;
  isFree: boolean;
} | null> {
  // Проверяем, является ли план бесплатным по имени
  const freePlanNames = [
    "Пробный",
    "Trial",
    "Бесплатный",
    "Free",
    "Тегін",
    "Сынақ",
  ];
  const isFreeByName = freePlanNames.includes(planName);

  // Ищем план в базе данных
  const subscriptionPlan = await SubscriptionPlan.findOne({
    $or: [
      { "name.ru": planName },
      { "name.en": planName },
      { "name.kk": planName },
      { name: planName },
      { id: "free" },
    ],
  });

  if (subscriptionPlan) {
    return {
      id: subscriptionPlan.id as string,
      isFree: subscriptionPlan.isFree === true || isFreeByName,
    };
  }

  // Если план не найден, но имя совпадает с бесплатным - считаем бесплатным
  if (isFreeByName) {
    return { id: "free", isFree: true };
  }

  // Определяем по имени плана
  const planNameLower = planName.toLowerCase();
  if (
    planNameLower.includes("стандарт") ||
    planNameLower.includes("standard")
  ) {
    return { id: "standard", isFree: false };
  }
  if (planNameLower.includes("про") || planNameLower.includes("pro")) {
    return { id: "pro", isFree: false };
  }

  return null;
}

/**
 * Проверяет, истек ли пробный период
 */
export function isTrialExpired(company: ICompany): boolean {
  if (!company.trialEndDate) {
    return false; // Если нет даты окончания, считаем что не истек
  }

  try {
    const endDate = new Date(company.trialEndDate);
    const now = new Date();
    return now > endDate;
  } catch {
    return false;
  }
}

/**
 * Получает права доступа для компании на основе её плана
 */
export async function getPlanPermissions(
  company: ICompany,
): Promise<PlanPermissions> {
  const planInfo = await getPlanById(company.plan);
  const isFree = planInfo?.isFree ?? true;
  const planId = planInfo?.id ?? "free";

  // Если план бесплатный, проверяем, не истек ли пробный период
  if (isFree) {
    const trialExpired = isTrialExpired(company);
    if (trialExpired) {
      // Пробный период истек - только просмотр
      return {
        canReply: false,
        canChangeStatus: false,
        canViewBasicAnalytics: false,
        canViewExtendedAnalytics: false,
        canViewReports: false,
        canViewGrowth: false,
        canViewTeamMood: false,
        isReadOnly: true,
      };
    }
    // Пробный период активен - только просмотр (read-only)
    return {
      canReply: false,
      canChangeStatus: false,
      canViewBasicAnalytics: false,
      canViewExtendedAnalytics: false,
      canViewReports: false,
      canViewGrowth: false,
      canViewTeamMood: false,
      isReadOnly: true,
    };
  }

  // Standard план
  if (planId === "standard") {
    return {
      canReply: true,
      canChangeStatus: true,
      canViewBasicAnalytics: true,
      canViewExtendedAnalytics: false,
      canViewReports: false,
      canViewGrowth: true,
      canViewTeamMood: false,
      isReadOnly: false,
    };
  }

  // Pro план
  if (planId === "pro") {
    return {
      canReply: true,
      canChangeStatus: true,
      canViewBasicAnalytics: true,
      canViewExtendedAnalytics: true,
      canViewReports: true,
      canViewGrowth: true,
      canViewTeamMood: true,
      isReadOnly: false,
    };
  }

  // По умолчанию - только просмотр (для неизвестных планов)
  return {
    canReply: false,
    canChangeStatus: false,
    canViewBasicAnalytics: false,
    canViewExtendedAnalytics: false,
    canViewReports: false,
    canViewGrowth: false,
    canViewTeamMood: false,
    isReadOnly: true,
  };
}
