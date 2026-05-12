import { DashboardLayout } from "@/components/navigation"
import { DataStreamProvider } from "@/components/chatsdk/data-stream-provider"
import { ChatHistoryPanel } from "@/components/chatsdk/chat-history-panel"
import { Toaster } from "sonner"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout noPad>
      <DataStreamProvider>
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          <ChatHistoryPanel />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            {children}
          </div>
        </div>
      </DataStreamProvider>
      <Toaster position="top-center" />
    </DashboardLayout>
  )
}
