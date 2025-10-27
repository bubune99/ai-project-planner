import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { Project } from "@/lib/types"

interface ProjectOverviewProps {
  project: Project
}

export function ProjectOverview({ project }: ProjectOverviewProps) {
  const statusColors = {
    planning: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    in_progress: "bg-green-500/10 text-green-500 border-green-500/20",
    review: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    completed: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  }

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border hover:shadow-lg transition-all duration-300">
      <h3 className="text-lg font-semibold text-foreground mb-4">Project Overview</h3>

      <div className="space-y-4">
        <div>
          <h4 className="text-2xl font-bold text-foreground mb-2">{project.name}</h4>
          <Badge className={`${statusColors[project.status]} border`}>
            {project.status.replace("_", " ").toUpperCase()}
          </Badge>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Current Phase</p>
          <p className="text-foreground font-medium">{project.phase}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-sm font-semibold text-foreground">{project.progress}%</p>
          </div>
          <Progress value={project.progress} className="h-2" />
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => (
              <Badge key={tech} variant="secondary" className="text-xs">
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
