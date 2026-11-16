import { DashboardLayout } from "@/components/navigation"

// This page fills the room the app shell leaves it. It used to be a screen of its own: no menu, no way back, and
// painted dark whatever the theme.
export default function ImpactLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout noPad>{children}</DashboardLayout>
}
