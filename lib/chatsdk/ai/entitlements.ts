/**
 * User entitlements for chat models
 */

export type UserType = "guest" | "regular" | "premium";

export interface Entitlements {
  allowedModels: string[];
  maxMessages?: number;
  features: string[];
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    allowedModels: ["chat-model"],
    maxMessages: 10,
    features: [],
  },
  regular: {
    allowedModels: ["chat-model", "chat-model-reasoning"],
    features: ["history", "export"],
  },
  premium: {
    allowedModels: ["chat-model", "chat-model-reasoning"],
    features: ["history", "export", "priority"],
  },
};
