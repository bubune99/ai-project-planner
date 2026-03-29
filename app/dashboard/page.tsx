"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { TodaysFocus } from "@/components/dashboard/TodaysFocus"
import { ActivityFeed } from "@/components/dashboard/ActivityFeed"
import {
  FolderKanban,
  Lightbulb,
  Wallet,
  Brain,
  CheckSquare,
  TrendingUp,
  TrendingDown,
  Zap,
  ArrowRight,
  Activity,
  Sparkles,
  DollarSign,
  ListTodo,
  MessageSquare,
} from "lucide-react"

interface DashboardStats {
  projects: {
    total: number
    inProgress: number
    completed: number
    recentActivity: number
  }
  ideas: {
    total: number
    promoted: number
    recentCount: number
  }
  finance: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    cashFlow: number
  }
  todos: {
    total: number
    completed: number
    overdue: number
    dueToday: number
  }
  agents: {
    totalJobs: number
    running: number
    completed: number
    failed: number
  }
}

export default function DashboardPage() {
  const user = useUser()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // Fetch data from multiple endpoints in parallel
      const [projectsRes, ideasRes, financeRes, todosRes, agentsRes] = await Promise.allSettled([
        fetch("/api/projects"),
        fetch("/api/ideas"),
        fetch("/api/finance/summary?period=month"),
        fetch("/api/todos"),
        fetch("/api/agent-jobs"),
      ])

      // Process projects
      let projectStats = { total: 0, inProgress: 0, completed: 0, recentActivity: 0 }
      if (projectsRes.status === "fulfilled" && projectsRes.value.ok) {
        const data = await projectsRes.value.json()
        const projects = data.data || []
        projectStats = {
          total: projects.length,
          inProgress: projects.filter((p: any) => p.status === "in-progress").length,
          completed: projects.filter((p: any) => p.status === "completed").length,
          recentActivity: projects.filter((p: any) => {
            const updated = new Date(p.updatedAt)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            return updated > weekAgo
          }).length,
        }
      }

      // Process ideas
      let ideaStats = { total: 0, promoted: 0, recentCount: 0 }
      if (ideasRes.status === "fulfilled" && ideasRes.value.ok) {
        const data = await ideasRes.value.json()
        const ideas = data.data || []
        ideaStats = {
          total: ideas.length,
          promoted: ideas.filter((i: any) => i.promotedToProject).length,
          recentCount: ideas.filter((i: any) => {
            const created = new Date(i.createdAt)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            return created > weekAgo
          }).length,
        }
      }

      // Process finance
      let financeStats = { netWorth: 0, monthlyIncome: 0, monthlyExpenses: 0, cashFlow: 0 }
      if (financeRes.status === "fulfilled" && financeRes.value.ok) {
        const data = await financeRes.value.json()
        const summary = data.data || {}
        financeStats = {
          netWorth: summary.netWorth?.total || 0,
          monthlyIncome: summary.income?.total || 0,
          monthlyExpenses: summary.expenses?.total || 0,
          cashFlow: summary.cashFlow?.net || 0,
        }
      }

      // Process todos
      let todoStats = { total: 0, completed: 0, overdue: 0, dueToday: 0 }
      if (todosRes.status === "fulfilled" && todosRes.value.ok) {
        const data = await todosRes.value.json()
        const todos = data.data || []
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        todoStats = {
          total: todos.length,
          completed: todos.filter((t: any) => t.status === "completed").length,
          overdue: todos.filter((t: any) => {
            if (!t.dueDate || t.status === "completed") return false
            return new Date(t.dueDate) < today
          }).length,
          dueToday: todos.filter((t: any) => {
            if (!t.dueDate || t.status === "completed") return false
            const due = new Date(t.dueDate)
            return due >= today && due < tomorrow
          }).length,
        }
      }

      // Process agents
      let agentStats = { totalJobs: 0, running: 0, completed: 0, failed: 0 }
      if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
        const data = await agentsRes.value.json()
        const jobs = data.data || []
        agentStats = {
          totalJobs: jobs.length,
          running: jobs.filter((j: any) => j.status === "running").length,
          completed: jobs.filter((j: any) => j.status === "completed").length,
          failed: jobs.filter((j: any) => j.status === "failed").length,
        }
      }

      setStats({
        projects: projectStats,
        ideas: ideaStats,
        finance: financeStats,
        todos: todoStats,
        agents: agentStats,
      })

    } catch (error) {
      console.error("Failed to fetch dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">
                  {getGreeting()}, {user?.displayName || "User"}
                </h1>
                <p className="text-muted-foreground">
                  Here&apos;s an overview of your JARVIS platform
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="border-white/10 gap-2" asChild>
                  <Link href="/chat">
                    <MessageSquare className="h-4 w-4" />
                    AI Assistant
                  </Link>
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 gap-2" asChild>
                  <Link href="/projects">
                    <FolderKanban className="h-4 w-4" />
                    View Projects
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-8 py-8 space-y-8">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Projects Card */}
            <Link href="/projects">
              <Card className="bg-black/40 border-white/10 hover:border-blue-500/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Projects</CardTitle>
                  <FolderKanban className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-16 bg-white/10" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-white">{stats?.projects.total || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {stats?.projects.inProgress || 0} in progress
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Ideas Card */}
            <Link href="/ideas">
              <Card className="bg-black/40 border-white/10 hover:border-yellow-500/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Ideas</CardTitle>
                  <Lightbulb className="h-4 w-4 text-yellow-400" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-16 bg-white/10" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-white">{stats?.ideas.total || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {stats?.ideas.recentCount || 0} this week
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Todos Card */}
            <Link href="/todos">
              <Card className="bg-black/40 border-white/10 hover:border-green-500/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Tasks</CardTitle>
                  <CheckSquare className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-16 bg-white/10" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-white">
                        {(stats?.todos.total || 0) - (stats?.todos.completed || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats?.todos.dueToday || 0} due today
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Finance Card */}
            <Link href="/finance">
              <Card className="bg-black/40 border-white/10 hover:border-purple-500/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Net Worth</CardTitle>
                  <Wallet className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-24 bg-white/10" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-white">
                        {formatCurrency(stats?.finance.netWorth || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {(stats?.finance.cashFlow || 0) >= 0 ? (
                          <>
                            <TrendingUp className="h-3 w-3 text-green-400" />
                            <span className="text-green-400">+{formatCurrency(stats?.finance.cashFlow || 0)}</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-3 w-3 text-red-400" />
                            <span className="text-red-400">{formatCurrency(stats?.finance.cashFlow || 0)}</span>
                          </>
                        )}
                        <span className="text-gray-500">this month</span>
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Module Overview - Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Project Progress */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Project Progress</CardTitle>
                      <CardDescription>Active projects overview</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300" asChild>
                      <Link href="/projects">
                        View all <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full bg-white/10" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div className="p-4 rounded-lg bg-white/5">
                          <div className="text-2xl font-bold text-white">{stats?.projects.total || 0}</div>
                          <div className="text-xs text-gray-400">Total</div>
                        </div>
                        <div className="p-4 rounded-lg bg-blue-500/10">
                          <div className="text-2xl font-bold text-blue-400">{stats?.projects.inProgress || 0}</div>
                          <div className="text-xs text-gray-400">In Progress</div>
                        </div>
                        <div className="p-4 rounded-lg bg-green-500/10">
                          <div className="text-2xl font-bold text-green-400">{stats?.projects.completed || 0}</div>
                          <div className="text-xs text-gray-400">Completed</div>
                        </div>
                        <div className="p-4 rounded-lg bg-purple-500/10">
                          <div className="text-2xl font-bold text-purple-400">{stats?.projects.recentActivity || 0}</div>
                          <div className="text-xs text-gray-400">Active (7d)</div>
                        </div>
                      </div>
                      {stats?.projects.total ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Completion Rate</span>
                            <span className="text-white">
                              {Math.round((stats.projects.completed / stats.projects.total) * 100)}%
                            </span>
                          </div>
                          <Progress
                            value={(stats.projects.completed / stats.projects.total) * 100}
                            className="h-2 bg-white/10"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Finance Overview */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Financial Overview</CardTitle>
                      <CardDescription>Monthly cash flow summary</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-purple-400 hover:text-purple-300" asChild>
                      <Link href="/finance">
                        View details <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-24 w-full bg-white/10" />
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-green-500/10 text-center">
                        <DollarSign className="h-5 w-5 text-green-400 mx-auto mb-2" />
                        <div className="text-lg font-bold text-green-400">
                          {formatCurrency(stats?.finance.monthlyIncome || 0)}
                        </div>
                        <div className="text-xs text-gray-400">Income</div>
                      </div>
                      <div className="p-4 rounded-lg bg-red-500/10 text-center">
                        <TrendingDown className="h-5 w-5 text-red-400 mx-auto mb-2" />
                        <div className="text-lg font-bold text-red-400">
                          {formatCurrency(stats?.finance.monthlyExpenses || 0)}
                        </div>
                        <div className="text-xs text-gray-400">Expenses</div>
                      </div>
                      <div className="p-4 rounded-lg bg-blue-500/10 text-center">
                        <Activity className="h-5 w-5 text-blue-400 mx-auto mb-2" />
                        <div className={`text-lg font-bold ${(stats?.finance.cashFlow || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatCurrency(stats?.finance.cashFlow || 0)}
                        </div>
                        <div className="text-xs text-gray-400">Net Cash Flow</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Agent Jobs */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">Agent Activity</CardTitle>
                      <CardDescription>AI agent job status</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300" asChild>
                      <Link href="/agents">
                        View all <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-16 w-full bg-white/10" />
                  ) : (
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-white font-medium">{stats?.agents.running || 0}</span>
                        <span className="text-gray-400 text-sm">Running</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                        <span className="text-white font-medium">{stats?.agents.completed || 0}</span>
                        <span className="text-gray-400 text-sm">Completed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <span className="text-white font-medium">{stats?.agents.failed || 0}</span>
                        <span className="text-gray-400 text-sm">Failed</span>
                      </div>
                      <div className="ml-auto text-gray-400 text-sm">
                        {stats?.agents.totalJobs || 0} total jobs
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Activity & Quick Actions */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-400" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5" asChild>
                    <Link href="/projects">
                      <FolderKanban className="mr-2 h-4 w-4 text-blue-400" />
                      New Project
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5" asChild>
                    <Link href="/ideas">
                      <Lightbulb className="mr-2 h-4 w-4 text-yellow-400" />
                      Capture Idea
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5" asChild>
                    <Link href="/todos">
                      <ListTodo className="mr-2 h-4 w-4 text-green-400" />
                      Add Task
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5" asChild>
                    <Link href="/finance">
                      <DollarSign className="mr-2 h-4 w-4 text-purple-400" />
                      Log Transaction
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5" asChild>
                    <Link href="/memory">
                      <Brain className="mr-2 h-4 w-4 text-pink-400" />
                      Add Memory
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Today's Focus */}
              <TodaysFocus />

              {/* Recent Activity (real data) */}
              <ActivityFeed />

              {/* Ideas Highlight */}
              <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-yellow-400" />
                    Ideas Incubator
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-16 w-full bg-white/10" />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total Ideas</span>
                        <span className="text-white font-medium">{stats?.ideas.total || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Promoted to Projects</span>
                        <span className="text-green-400 font-medium">{stats?.ideas.promoted || 0}</span>
                      </div>
                      <Button size="sm" className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400" asChild>
                        <Link href="/ideas">
                          <Lightbulb className="mr-2 h-4 w-4" />
                          Explore Ideas
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
