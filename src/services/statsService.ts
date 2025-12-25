import { Message } from "../models/Message";
import { Company } from "../models/Company";

export interface Stats {
  new: number;
  inProgress: number;
  resolved: number;
  total: number;
}

export interface MessageDistribution {
  complaints: number;
  praises: number;
  suggestions: number;
}

export interface GrowthMetrics {
  rating: number;
  mood: "Позитивный" | "Нейтральный" | "Негативный";
  trend: "up" | "down" | "stable";
  pointsBreakdown?: {
    totalMessages: number;
    resolvedCases: number;
    responseSpeed: number;
    activityBonus: number;
    achievementsBonus: number;
  };
  nextLevel?: {
    current: number;
    next: number;
    progress: number;
  };
}

export const getCompanyStats = async (companyId: string): Promise<Stats> => {
  const company = await Company.findById(companyId);
  if (!company) {
    return { new: 0, inProgress: 0, resolved: 0, total: 0 };
  }

  const messages = await Message.find({ companyCode: company.code });

  let newCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;

  for (const message of messages) {
    if (message.status === "Новое") newCount++;
    else if (message.status === "В работе") inProgressCount++;
    else if (message.status === "Решено") resolvedCount++;
  }

  return {
    new: newCount,
    inProgress: inProgressCount,
    resolved: resolvedCount,
    total: newCount + inProgressCount + resolvedCount,
  };
};

export const getMessageDistribution = async (
  companyId: string,
): Promise<MessageDistribution> => {
  const company = await Company.findById(companyId);
  if (!company) {
    return { complaints: 0, praises: 0, suggestions: 0 };
  }

  const messages = await Message.find({ companyCode: company.code });

  let complaints = 0;
  let praises = 0;
  let suggestions = 0;

  for (const message of messages) {
    if (message.type === "complaint") complaints++;
    else if (message.type === "praise") praises++;
    else if (message.type === "suggestion") suggestions++;
  }

  return { complaints, praises, suggestions };
};

export const getGrowthMetrics = async (
  companyId: string,
): Promise<GrowthMetrics> => {
  const company = await Company.findById(companyId);
  if (!company) {
    return {
      rating: 0,
      mood: "Нейтральный",
      trend: "stable",
      pointsBreakdown: {
        totalMessages: 0,
        resolvedCases: 0,
        responseSpeed: 0,
        activityBonus: 0,
        achievementsBonus: 0,
      },
    };
  }

  const messages = await Message.find({ companyCode: company.code });

  const distribution = {
    complaints: messages.filter((m) => m.type === "complaint").length,
    praises: messages.filter((m) => m.type === "praise").length,
    suggestions: messages.filter((m) => m.type === "suggestion").length,
  };

  const resolvedComplaints = messages.filter(
    (m) => m.type === "complaint" && m.status === "Решено",
  ).length;
  const resolvedSuggestions = messages.filter(
    (m) => m.type === "suggestion" && m.status === "Решено",
  ).length;
  const totalResolved = resolvedComplaints + resolvedSuggestions;
  const totalProblems = distribution.complaints + distribution.suggestions;

  const resolvedRatio = totalProblems > 0 ? totalResolved / totalProblems : 0;
  const resolvedPoints = resolvedRatio * 50;

  let responseSpeedPoints = 0;
  let totalResponses = 0;

  messages.forEach((msg) => {
    if (msg.companyResponse && msg.updatedAt) {
      totalResponses++;
      const created = new Date(msg.createdAt);
      const updated = new Date(msg.updatedAt);
      const daysDiff = Math.floor(
        (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff <= 1) responseSpeedPoints += 5;
      else if (daysDiff <= 3) responseSpeedPoints += 3;
      else if (daysDiff <= 7) responseSpeedPoints += 1;
    }
  });

  const maxSpeedPoints = totalResponses * 5;
  const normalizedSpeedPoints =
    maxSpeedPoints > 0 ? (responseSpeedPoints / maxSpeedPoints) * 50 : 0;

  const totalPoints = resolvedPoints + normalizedSpeedPoints;
  const rating = Math.min(10, Math.round((totalPoints / 10) * 10) / 10);

  let mood: "Позитивный" | "Нейтральный" | "Негативный" = "Нейтральный";
  if (rating >= 7) mood = "Позитивный";
  else if (rating <= 4) mood = "Негативный";

  const trend: "up" | "down" | "stable" = "stable";

  const currentLevel = Math.floor(rating);
  const nextLevel = Math.min(10, currentLevel + 1);
  const progress = ((rating - currentLevel) / 1) * 100;

  return {
    rating,
    mood,
    trend,
    pointsBreakdown: {
      totalMessages: 0,
      resolvedCases: resolvedPoints,
      responseSpeed: normalizedSpeedPoints,
      activityBonus: 0,
      achievementsBonus: 0,
    },
    nextLevel: {
      current: currentLevel,
      next: nextLevel,
      progress: Math.round(progress),
    },
  };
};
