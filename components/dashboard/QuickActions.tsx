import { Button } from "@/components/ui/button"
import type { QuickAction } from "@/lib/types"

interface QuickActionsProps {
  actions: QuickAction[]
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>

      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant === "primary" ? "default" : "outline"}
            className={`h-24 flex flex-col items-center justify-center gap-2 hover:scale-105 transition-transform ${
              action.variant === "primary"
                ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0"
                : "bg-card/50 backdrop-blur-sm hover:bg-accent"
            }`}
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-sm font-medium">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
