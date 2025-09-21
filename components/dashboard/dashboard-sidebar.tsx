"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BarChart3,
  Settings,
  BookOpen,
  Zap,
  GitBranch,
  Code,
  Users,
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  Map,
} from "lucide-react"

const projects = [
  { id: "ecommerce", name: "E-commerce Platform", type: "Web App" },
  { id: "fitness", name: "Mobile Fitness App", type: "Mobile App" },
  { id: "portfolio", name: "Portfolio Website", type: "Website" },
  { id: "saas", name: "SaaS Dashboard", type: "Web App" },
]

const mainTabs = [
  { icon: LayoutDashboard, label: "Overview", id: "overview" },
  { icon: Map, label: "Project Execution", id: "execution" },
]

const sidebarItems = [
  { icon: Code, label: "Development" },
  { icon: BarChart3, label: "Progress" },
  { icon: GitBranch, label: "Version Control" },
  { icon: Users, label: "Team" },
  { icon: Calendar, label: "Timeline" },
  { icon: BookOpen, label: "Documentation" },
  { icon: Zap, label: "Integrations" },
  { icon: Settings, label: "Settings" },
]

interface DashboardSidebarProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
  activeTab: string
  onTabChange: (tab: string) => void
}

export function DashboardSidebar({ isCollapsed, onToggleCollapse, activeTab, onTabChange }: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        "border-r border-border bg-sidebar/50 backdrop-blur supports-[backdrop-filter]:bg-sidebar/50 transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
      )}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          {!isCollapsed && <div className="text-sm font-semibold text-sidebar-foreground">AI Project Planner</div>}
          <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="h-8 w-8 p-0 hover:bg-sidebar-accent">
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {!isCollapsed && (
          <div className="mb-6">
            <Select defaultValue="ecommerce">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{project.name}</span>
                      <span className="text-xs text-muted-foreground">{project.type}</span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new-project" className="border-t border-border mt-1 pt-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Plus className="h-4 w-4" />
                    <span className="font-medium">New Project</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mb-6">
          {!isCollapsed && <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">MAIN</div>}
          <nav className="space-y-1">
            {mainTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full text-sidebar-foreground transition-all duration-200",
                  isCollapsed ? "justify-center px-2" : "justify-start gap-3",
                  activeTab === tab.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                onClick={() => onTabChange(tab.id)}
                title={isCollapsed ? tab.label : undefined}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{tab.label}</span>}
              </Button>
            ))}
          </nav>
        </div>

        <div>
          {!isCollapsed && <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">TOOLS</div>}
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <Button
                key={item.label}
                variant="ghost"
                className={cn(
                  "w-full text-sidebar-foreground transition-all duration-200",
                  isCollapsed ? "justify-center px-2" : "justify-start gap-3",
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Button>
            ))}
          </nav>
        </div>
      </div>
    </aside>
  )
}
