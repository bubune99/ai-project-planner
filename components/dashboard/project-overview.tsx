import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Calendar, Users, ExternalLink, GitBranch, Target, Play } from "lucide-react"

const currentProject = {
  id: 1,
  name: "E-commerce Platform",
  description: "Full-stack web application with payment integration, user authentication, and admin dashboard",
  status: "In Progress",
  progress: 65,
  dueDate: "2024-02-15",
  startDate: "2024-01-01",
  team: 3,
  techStack: ["Next.js", "Supabase", "Stripe", "Tailwind CSS", "TypeScript"],
  priority: "High",
  currentPhase: "Backend Development",
  totalTasks: 47,
  completedTasks: 31,
  githubRepo: "https://github.com/user/ecommerce-platform",
  lastCommit: "2 hours ago",
}

export function ProjectOverview() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-balance text-xl">{currentProject.name}</CardTitle>
              <CardDescription className="text-pretty text-sm">{currentProject.description}</CardDescription>
            </div>
            <Badge
              variant={
                currentProject.status === "Completed"
                  ? "default"
                  : currentProject.status === "In Progress"
                    ? "secondary"
                    : "outline"
              }
              className="text-xs px-2 py-1"
            >
              {currentProject.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Overall Progress</span>
              <span className="text-xs text-muted-foreground">{currentProject.progress}%</span>
            </div>
            <Progress value={currentProject.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {currentProject.completedTasks}/{currentProject.totalTasks} tasks
              </span>
              <span>{currentProject.currentPhase}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">Due Date</div>
                <div className="text-muted-foreground">{currentProject.dueDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Users className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">Team</div>
                <div className="text-muted-foreground">{currentProject.team} members</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Target className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">Priority</div>
                <div className="text-muted-foreground">{currentProject.priority}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">Last Commit</div>
                <div className="text-muted-foreground">{currentProject.lastCommit}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <span className="text-xs font-medium">Technology Stack</span>
              <div className="flex flex-wrap gap-1">
                {currentProject.techStack.slice(0, 4).map((tech) => (
                  <Badge key={tech} variant="secondary" className="text-xs px-2 py-0">
                    {tech}
                  </Badge>
                ))}
                {currentProject.techStack.length > 4 && (
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    +{currentProject.techStack.length - 4}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="gap-2 flex-1">
                <Play className="h-3 w-3" />
                Continue Work
              </Button>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <GitBranch className="h-3 w-3" />
                Repo
              </Button>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <ExternalLink className="h-3 w-3" />
                Open
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
