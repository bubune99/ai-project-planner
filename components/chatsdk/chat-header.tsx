"use client";

import { useRouter } from "next/navigation";
import { memo } from "react";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 16px", borderBottom: "1px solid var(--j-hairline)",
      background: "oklch(0.135 0 0 / 0.8)", backdropFilter: "blur(8px)",
      flexShrink: 0,
    }}>
      <button
        onClick={() => { router.push("/chat"); router.refresh() }}
        style={{
          background: "oklch(0.870 0.045 252 / 0.15)", border: "1px solid oklch(0.870 0.045 252 / 0.3)",
          borderRadius: 7, padding: "5px 12px", fontSize: 12, color: "var(--j-accent)",
          cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}
      >
        + New
      </button>

      <div style={{ flex: 1 }} />

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
  prev.isReadonly === next.isReadonly
);
