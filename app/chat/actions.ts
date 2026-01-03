/**
 * Chat actions for chatsdk components
 */

"use server";

import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/chatsdk/visibility-selector";

export async function saveChatModelAsCookie(model: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function getChatModelFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("chat-model")?.value;
}

export async function deleteTrailingMessages({
  id,
}: {
  id: string;
}): Promise<void> {
  // For now, this is a stub - implement when message deletion is needed
  console.log("deleteTrailingMessages called for message:", id);
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}): Promise<void> {
  // For now, this is a stub - implement when visibility update is needed
  console.log("updateChatVisibility called:", chatId, visibility);
}
