import { DashboardLayout } from "@/components/navigation"
import { DataStreamProvider } from "@/components/chatsdk/data-stream-provider"
import { ChatHistoryPanel } from "@/components/chatsdk/chat-history-panel"
import { SidebarProvider } from "@/components/chatsdk/ui/sidebar"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout noPad>
      {/* chatsdk components (ChatHistoryPanel, Chat) call useSidebar(), which
          requires a SidebarProvider ancestor — without it /chat throws
          "useSidebar must be used within a SidebarProvider." */}
      {/* min-h-0 + flex-1 replace the wrapper's default min-h-svh, which added a
          second full screen of height under the topbar. */}
      <SidebarProvider className="min-h-0 flex-1">
        <DataStreamProvider>
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            <ChatHistoryPanel />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
              {children}
            </div>
          </div>
        </DataStreamProvider>
      </SidebarProvider>
      {/* Toaster is mounted globally in app/layout.tsx */}
    </DashboardLayout>
  )
}
