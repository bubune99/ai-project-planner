import type { UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chatsdk/artifact";
import type { Suggestion } from "./db/schema";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

// UITool structure required by the AI SDK
type UITool = {
  input: unknown;
  output: unknown | undefined;
};

// Simplified ChatTools type - actual tools are defined in lib/ai/tools.ts
// This type satisfies the UITools constraint for UI message typing
export type ChatTools = Record<string, UITool>;

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
