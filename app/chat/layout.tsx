import { cookies } from "next/headers";
import { AppSidebar } from "@/components/chatsdk/app-sidebar";
import { DataStreamProvider } from "@/components/chatsdk/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/chatsdk/ui/sidebar";
import { TooltipProvider } from "@/components/chatsdk/ui/tooltip";
import { getCurrentUser } from "@/lib/chatsdk/auth-compat";
import { Toaster } from "sonner";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore] = await Promise.all([
    Promise.resolve(getCurrentUser()),
    cookies(),
  ]);

  const isCollapsed = cookieStore.get("sidebar:state")?.value !== "true";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={!isCollapsed}>
        <DataStreamProvider>
          <AppSidebar user={user ?? undefined} />
          <SidebarInset>{children}</SidebarInset>
        </DataStreamProvider>
      </SidebarProvider>
      <Toaster position="top-center" />
    </TooltipProvider>
  );
}
