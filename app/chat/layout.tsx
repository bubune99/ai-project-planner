import { DashboardLayout } from "@/components/navigation"
import { ChatShell } from "@/components/chat/ChatShell"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout noPad hideTopbarOnPhone>
      <ChatShell>{children}</ChatShell>
    </DashboardLayout>
  )
}
