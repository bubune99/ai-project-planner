"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { ProjectOverview } from "@/components/dashboard/project-overview"
import { ProjectExecutionView } from "@/components/dashboard/project-execution-view"
import { TechStackDocumentation } from "@/components/dashboard/tech-stack-documentation"

export default function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
        <main className={`flex-1 p-4 space-y-4 transition-all duration-300 ${sidebarCollapsed ? "ml-0" : "ml-0"}`}>
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ProjectOverview />
              </div>
              <div className="lg:col-span-1">
                <TechStackDocumentation />
              </div>
            </div>
          )}

          {activeTab === "execution" && <ProjectExecutionView />}
        </main>
      </div>
    </div>
  )
}
