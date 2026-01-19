"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  LayoutDashboard,
  FolderKanban,
  Lightbulb,
  Wallet,
  Brain,
  Bot,
  CheckSquare,
  Settings,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
} from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  disabled?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Projects", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    title: "Modules",
    items: [
      { title: "Ideas", href: "/ideas", icon: Lightbulb, badge: "New" },
      { title: "Finance", href: "/finance", icon: Wallet, badge: "New" },
      { title: "Memory", href: "/memory", icon: Brain, badge: "New" },
      { title: "Agents", href: "/agents", icon: Bot, badge: "New" },
    ],
  },
  {
    title: "Tools",
    items: [
      { title: "Todos", href: "/todos", icon: CheckSquare },
      { title: "AI Chat", href: "/chat", icon: MessageSquare },
    ],
  },
  {
    title: "System",
    items: [
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
]

interface AppSidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function AppSidebar({ collapsed = false, onCollapsedChange }: AppSidebarProps) {
  const pathname = usePathname()
  const user = useUser()

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "flex h-screen flex-col border-r border-white/10 bg-black/40 backdrop-blur-sm transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex h-16 items-center border-b border-white/10 px-4",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-white">JARVIS</span>
            </Link>
          )}
          {collapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <Bot className="h-5 w-5 text-white" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-gray-400 hover:text-white",
              collapsed && "absolute -right-3 top-4 z-10 rounded-full border border-white/10 bg-black"
            )}
            onClick={() => onCollapsedChange?.(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-6 px-2">
            {navSections.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                    const Icon = item.icon

                    const linkContent = (
                      <Link
                        href={item.disabled ? "#" : item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-blue-500/20 text-blue-400"
                            : "text-gray-400 hover:bg-white/5 hover:text-white",
                          item.disabled && "cursor-not-allowed opacity-50",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1">{item.title}</span>
                            {item.badge && (
                              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    )

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" className="flex items-center gap-2">
                            {item.title}
                            {item.badge && (
                              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                                {item.badge}
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )
                    }

                    return <div key={item.href}>{linkContent}</div>
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer - User */}
        {user && (
          <>
            <Separator className="bg-white/10" />
            <div className={cn(
              "p-4",
              collapsed && "flex justify-center"
            )}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => user.signOut()}
                    >
                      <User className="h-5 w-5 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-sm">
                      <p className="font-medium">{user.displayName || user.primaryEmail}</p>
                      <p className="text-gray-400">Click to sign out</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
                    <User className="h-5 w-5 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {user.displayName || "User"}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {user.primaryEmail}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-white"
                    onClick={() => user.signOut()}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
