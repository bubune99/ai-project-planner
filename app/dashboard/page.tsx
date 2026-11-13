"use client"

import { DashboardLayout } from "@/components/navigation"
import { OpxDashboard } from "@/components/jarvis/opx-dashboard"

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <OpxDashboard />
    </DashboardLayout>
  )
}
