import type { LanguageModelUsage } from "ai";

// Context limits for the model
export type ContextLimits = {
  totalMax?: number;
  combinedMax?: number;
  inputMax?: number;
};

// Cost breakdown in USD
export type CostUSD = {
  inputUSD?: number;
  outputUSD?: number;
  cacheReadUSD?: number;
  reasoningUSD?: number;
  totalUSD?: number;
};

// Usage data type (replaces tokenlens/helpers UsageData)
export type UsageData = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  context?: ContextLimits;
  costUSD?: CostUSD;
};

// Server-merged usage: base usage + usage summary + optional modelId
export type AppUsage = LanguageModelUsage & UsageData & { modelId?: string };
