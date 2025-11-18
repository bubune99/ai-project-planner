import { Card } from "@/components/ui/card"

interface ProgressMetricsProps {
  progress: number
  tasksCompleted: number
  totalTasks: number
  commitsToday: number
  lastUpdate: string
}

export function ProgressMetrics({
  progress,
  tasksCompleted,
  totalTasks,
  commitsToday,
  lastUpdate,
}: ProgressMetricsProps) {
  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border hover:shadow-lg transition-all duration-300">
      <h3 className="text-lg font-semibold text-foreground mb-4">Progress Metrics</h3>

      <div className="flex flex-col items-center">
        <div className="relative w-40 h-40 mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 70}`}
              strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
              className="text-blue-500 transition-all duration-1000"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-foreground">{progress}%</span>
          </div>
        </div>

        <div className="w-full space-y-3">
          <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Tasks</span>
            <span className="text-sm font-semibold text-foreground">
              {tasksCompleted} of {totalTasks} completed
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Commits today</span>
            <span className="text-sm font-semibold text-foreground">{commitsToday}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Last update</span>
            <span className="text-sm font-semibold text-foreground">{lastUpdate}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
