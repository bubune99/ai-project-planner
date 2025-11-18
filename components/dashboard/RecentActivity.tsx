import { Card } from "@/components/ui/card"
import type { Activity } from "@/lib/types"

interface RecentActivityProps {
  activities: Activity[]
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>

      <div className="space-y-3">
        {activities.map((activity, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <span className="text-xl flex-shrink-0">{activity.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{activity.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
