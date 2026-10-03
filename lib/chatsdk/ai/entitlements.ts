/**
 * User entitlements for the chat agents (allowedModels holds agent ids —
 * lib/agents/catalog.ts). Guests get JARVIS only.
 */

export type UserType = "guest" | "regular" | "premium";

export interface Entitlements {
  allowedModels: string[];
  maxMessages?: number;
  features: string[];
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    allowedModels: ["jarvis"],
    maxMessages: 10,
    features: [],
  },
  regular: {
    allowedModels: ["jarvis", "operator", "researcher"],
    features: ["history", "export"],
  },
  premium: {
    allowedModels: ["jarvis", "operator", "researcher"],
    features: ["history", "export", "priority"],
  },
};
