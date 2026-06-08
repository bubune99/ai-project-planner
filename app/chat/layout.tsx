import { DashboardLayout } from "@/components/navigation"
import { DataStreamProvider } from "@/components/chatsdk/data-stream-provider"
import { ChatHistoryPanel } from "@/components/chatsdk/chat-history-panel"
import { SidebarProvider } from "@/components/chatsdk/ui/sidebar"
import { Toaster } from "sonner"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout noPad>
      {/* chatsdk components (ChatHistoryPanel, Chat) call useSidebar(), which
          requires a SidebarProvider ancestor — without it /chat throws
          "useSidebar must be used within a SidebarProvider." */}
      <SidebarProvider>
        <DataStreamProvider>
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            <ChatHistoryPanel />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
              {children}
            </div>
          </div>
        </DataStreamProvider>
      </SidebarProvider>
      <Toaster position="top-center" />
    </DashboardLayout>
  )
}
