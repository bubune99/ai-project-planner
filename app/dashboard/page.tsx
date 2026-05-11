"use client"

import { DashboardLayout } from "@/components/navigation"
import { JarvisDashboard } from "@/components/jarvis/dashboard"

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <JarvisDashboard />
    </DashboardLayout>
  )
}
