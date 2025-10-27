import { Card } from "@/components/ui/card"
import type { Agent } from "@/lib/types"

interface AgentStatusProps {
  agents: Agent[]
}

const agentEmojis = {
  v0: "⚡",
  claude: "🧠",
  gemini: "💎",
  gpt: "🤖",
}

const statusConfig = {
  active: {
    color: "bg-green-500",
    label: "Active",
  },
  idle: {
    color: "bg-gray-500",
    label: "Idle",
  },
  working: {
    color: "bg-yellow-500",
    label: "Working",
  },
  error: {
    color: "bg-red-500",
    label: "Error",
  },
}

export function AgentStatus({ agents }: AgentStatusProps) {
  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border hover:shadow-lg transition-all duration-300">
      <h3 className="text-lg font-semibold text-foreground mb-4">Agent Status</h3>

      <div className="space-y-3">
        {agents.map((agent) => {
          const status = statusConfig[agent.status]
          return (
            <div
              key={agent.name}
              className="flex items-center justify-between p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className={`w-3 h-3 rounded-full ${status.color} ${agent.status === "active" ? "animate-pulse" : ""}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{agentEmojis[agent.name]}</span>
                  <span className="font-medium text-foreground capitalize">{agent.name}</span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">{status.label}</p>
                {agent.currentTask && <p className="text-xs text-foreground mt-0.5">"{agent.currentTask}"</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
