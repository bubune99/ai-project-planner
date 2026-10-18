"use client";

import { useRouter } from "next/navigation";
import { memo } from "react";
import { toggleHistoryDrawer, useIsNarrow } from "@/lib/chatsdk/history-drawer";
import { chatModels } from "@/lib/chatsdk/ai/models";
import { OPEN_MENU_EVENT } from "@/components/navigation/dashboard-layout";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  selectedModelId,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  selectedModelId?: string;
}) {
  const router = useRouter();
  const narrow = useIsNarrow();
  const agent = chatModels.find((m) => m.id === selectedModelId);

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 16px", borderBottom: "1px solid var(--j-hairline)",
      background: "oklch(0.135 0 0 / 0.8)", backdropFilter: "blur(8px)",
      flexShrink: 0,
    }}>
      {narrow && (
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
          data-ui="chat.menu"
          aria-label="Open menu"
          style={{
            background: "transparent", border: "1px solid var(--j-ring)", borderRadius: 7,
            width: 36, height: 36, color: "oklch(0.78 0 0)", cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}
        >
          ☰
        </button>
      )}
      {narrow && agent && (
        <div style={{ minWidth: 0, lineHeight: 1.15 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.97 0 0)" }}>{agent.name}</div>
          <div style={{ fontSize: 10.5, color: "oklch(0.58 0 0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {agent.description}
          </div>
        </div>
      )}
      <div style={{ flex: narrow ? 1 : 0 }} />
      {narrow && (
        <button
          onClick={toggleHistoryDrawer}
          data-ui="chat.history"
          aria-label="Chat history"
          style={{
            background: "transparent", border: "1px solid var(--j-ring)", borderRadius: 7,
            padding: "5px 12px", minHeight: 36, fontSize: 12, color: "oklch(0.78 0 0)",
            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
          }}
        >
          History
        </button>
      )}
      <button
        data-ui="chat.new"
        onClick={() => { router.push("/chat"); router.refresh() }}
        style={{
          background: "oklch(0.870 0.045 252 / 0.15)", border: "1px solid oklch(0.870 0.045 252 / 0.3)",
          borderRadius: 7, padding: "5px 12px", minHeight: narrow ? 36 : undefined, fontSize: 12, color: "var(--j-accent)",
          cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}
      >
        + New
      </button>

      <div style={{ flex: narrow ? 0 : 1 }} />

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prev, next) =>
  prev.chatId === next.chatId &&
  prev.selectedVisibilityType === next.selectedVisibilityType &&
  prev.isReadonly === next.isReadonly &&
  prev.selectedModelId === next.selectedModelId
);
