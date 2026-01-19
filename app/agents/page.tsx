"use client"

import { DashboardLayout } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bot, Plus, MessageSquare, Zap, History, Settings } from "lucide-react"

export default function AgentsPage() {
  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">AI Agents</h1>
                <p className="text-muted-foreground">Manage and monitor your AI assistants</p>
              </div>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" disabled>
                <Plus className="h-4 w-4" />
                New Agent
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Coming Soon Card */}
            <Card className="border-white/10 bg-black/40">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/20">
                  <Bot className="h-8 w-8 text-orange-400" />
                </div>
                <CardTitle className="text-2xl text-white">Agents Module Coming Soon</CardTitle>
                <CardDescription className="text-gray-400">
                  Manage multiple AI agents, view conversation histories, and configure agent behaviors.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
                  <FeatureCard
                    icon={Bot}
                    title="Agent Management"
                    description="Create and configure multiple specialized AI agents"
                  />
                  <FeatureCard
                    icon={MessageSquare}
                    title="Conversations"
                    description="View and search through conversation histories"
                  />
                  <FeatureCard
                    icon={Zap}
                    title="Agent Actions"
                    description="Track tool usage and agent activities"
                  />
                  <FeatureCard
                    icon={History}
                    title="Session History"
                    description="Review past sessions and their outcomes"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <Icon className="h-6 w-6 text-orange-400 mb-2" />
      <h3 className="font-medium text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  )
}
