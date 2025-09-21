import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Circle, Clock, AlertTriangle } from "lucide-react"

const projectPhases = [
  {
    phase: "Planning & Requirements",
    status: "completed",
    progress: 100,
    tasks: ["Business requirements", "Technical specifications", "UI/UX wireframes"],
    completedTasks: 3,
    totalTasks: 3,
  },
  {
    phase: "Design & Architecture",
    status: "completed",
    progress: 100,
    tasks: ["Database schema", "API design", "Component architecture"],
    completedTasks: 3,
    totalTasks: 3,
  },
  {
    phase: "Frontend Development",
    status: "in-progress",
    progress: 75,
    tasks: ["User interface", "State management", "API integration", "Testing"],
    completedTasks: 3,
    totalTasks: 4,
  },
  {
    phase: "Backend Development",
    status: "in-progress",
    progress: 60,
    tasks: ["API endpoints", "Database setup", "Authentication", "Payment integration"],
    completedTasks: 2,
    totalTasks: 4,
  },
  {
    phase: "Testing & QA",
    status: "pending",
    progress: 0,
    tasks: ["Unit tests", "Integration tests", "User acceptance testing"],
    completedTasks: 0,
    totalTasks: 3,
  },
  {
    phase: "Deployment",
    status: "pending",
    progress: 0,
    tasks: ["Production setup", "CI/CD pipeline", "Monitoring"],
    completedTasks: 0,
    totalTasks: 3,
  },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-accent" />
    case "in-progress":
      return <Clock className="h-5 w-5 text-primary" />
    case "pending":
      return <Circle className="h-5 w-5 text-muted-foreground" />
    default:
      return <AlertTriangle className="h-5 w-5 text-destructive" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return <Badge className="bg-accent text-accent-foreground">Completed</Badge>
    case "in-progress":
      return <Badge variant="secondary">In Progress</Badge>
    case "pending":
      return <Badge variant="outline">Pending</Badge>
    default:
      return <Badge variant="destructive">Blocked</Badge>
  }
}

export function ProgressTracker() {
  const overallProgress = Math.round(
    projectPhases.reduce((acc, phase) => acc + phase.progress, 0) / projectPhases.length,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-balance">Project Progress Tracker</CardTitle>
            <CardDescription>Visual timeline of your project development phases</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{overallProgress}%</div>
            <div className="text-sm text-muted-foreground">Overall Progress</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Overall Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Project Completion</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-3" />
          </div>

          {/* Phase Breakdown */}
          <div className="space-y-4">
            {projectPhases.map((phase, index) => (
              <div key={index} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(phase.status)}
                    <h3 className="font-semibold text-balance">{phase.phase}</h3>
                  </div>
                  {getStatusBadge(phase.status)}
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span>
                      {phase.completedTasks}/{phase.totalTasks} tasks completed
                    </span>
                  </div>
                  <Progress value={phase.progress} className="h-2" />
                </div>

                <div className="flex flex-wrap gap-2">
                  {phase.tasks.map((task, taskIndex) => (
                    <Badge
                      key={taskIndex}
                      variant={taskIndex < phase.completedTasks ? "default" : "outline"}
                      className="text-xs"
                    >
                      {task}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
