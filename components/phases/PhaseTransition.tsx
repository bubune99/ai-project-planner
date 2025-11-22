"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Circle, ArrowRight, AlertCircle, XCircle } from "lucide-react"

interface Phase {
  id: string
  project_id: string
  phase: "ideation" | "architecture" | "construction" | "testing" | "deployment" | "maintenance"
  status: "active" | "completed" | "skipped"
  entry_date: string
  exit_date: string | null
  exit_criteria_met: boolean
  notes: string | null
}

interface PhaseTransitionProps {
  projectId: string
  currentPhase: string
}

const PHASE_ORDER = ["ideation", "architecture", "construction", "testing", "deployment", "maintenance"]

const PHASE_INFO = {
  ideation: {
    name: "Ideation",
    description: "Define vision, goals, and requirements",
    exitCriteria: ["Business context defined", "Success metrics established", "Initial requirements documented"],
  },
  architecture: {
    name: "Architecture",
    description: "Design system architecture and tech stack",
    exitCriteria: [
      "Tech stack chosen and justified",
      "System architecture documented",
      "ADRs created for key decisions",
    ],
  },
  construction: {
    name: "Construction",
    description: "Build features and implement functionality",
    exitCriteria: ["All planned features implemented", "Code reviewed and merged", "Unit tests passing"],
  },
  testing: {
    name: "Testing",
    description: "QA, integration testing, and bug fixes",
    exitCriteria: ["Integration tests passing", "Critical bugs resolved", "Performance validated"],
  },
  deployment: {
    name: "Deployment",
    description: "Deploy to production and monitor",
    exitCriteria: ["Deployed to production", "Monitoring configured", "Documentation complete"],
  },
  maintenance: {
    name: "Maintenance",
    description: "Monitor, fix bugs, and iterate",
    exitCriteria: ["Ongoing monitoring", "Bug backlog managed", "Performance optimized"],
  },
}

export function PhaseTransition({ projectId, currentPhase }: PhaseTransitionProps) {
  const [phases, setPhases] = useState<Phase[]>([])
  const [loading, setLoading] = useState(true)
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false)
  const [transitionNotes, setTransitionNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchPhases()
  }, [projectId])

  const fetchPhases = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/phases`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch phases' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch phases`)
      }

      const data = await response.json()
      setPhases(data.phases || [])
    } catch (error) {
      console.error("Failed to fetch phases:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while fetching phases')
    } finally {
      setLoading(false)
    }
  }

  const handleTransition = async () => {
    const currentIndex = PHASE_ORDER.indexOf(currentPhase as any)
    const nextPhase = PHASE_ORDER[currentIndex + 1]

    if (!nextPhase) return

    try {
      setIsSubmitting(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/phases/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_phase: nextPhase,
          notes: transitionNotes,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to transition phase' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to transition phase`)
      }

      setIsTransitionModalOpen(false)
      setTransitionNotes("")
      await fetchPhases()
    } catch (error) {
      console.error("Failed to transition phase:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while transitioning phase')
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase as any)
  const nextPhase = PHASE_ORDER[currentPhaseIndex + 1]

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
            aria-label="Dismiss error"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Project Lifecycle</h2>
          <p className="text-muted-foreground text-sm mt-1">Track progress through development phases</p>
        </div>
        {nextPhase && (
          <Button className="bg-blue-500 hover:bg-blue-600 gap-2" onClick={() => setIsTransitionModalOpen(true)}>
            <ArrowRight className="h-4 w-4" />
            Transition to {PHASE_INFO[nextPhase as keyof typeof PHASE_INFO].name}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {PHASE_ORDER.map((phase, index) => {
          const phaseData = phases.find((p) => p.phase === phase)
          const isActive = phase === currentPhase
          const isCompleted = phaseData?.status === "completed"
          const isPending = index > currentPhaseIndex
          const info = PHASE_INFO[phase as keyof typeof PHASE_INFO]

          return (
            <Card
              key={phase}
              className={`p-6 ${
                isActive
                  ? "bg-blue-500/20 border-blue-500/50"
                  : isCompleted
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-gray-900/50 border-white/10"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : isActive ? (
                    <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <div className="h-3 w-3 rounded-full bg-white animate-pulse" />
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-gray-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{info.name}</h3>
                    {isActive && <Badge className="bg-blue-500">In Progress</Badge>}
                    {isCompleted && <Badge className="bg-green-500">Completed</Badge>}
                    {isPending && (
                      <Badge variant="outline" className="border-white/10">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm mb-3">{info.description}</p>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-white">Exit Criteria:</p>
                    {info.exitCriteria.map((criteria, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-500 mt-0.5" />
                        )}
                        <span className={isCompleted ? "text-green-400" : "text-muted-foreground"}>{criteria}</span>
                      </div>
                    ))}
                  </div>

                  {phaseData?.notes && (
                    <div className="mt-3 p-3 bg-black/30 rounded">
                      <p className="text-sm text-muted-foreground">{phaseData.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog open={isTransitionModalOpen} onOpenChange={setIsTransitionModalOpen}>
        <DialogContent className="bg-gray-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              Transition to {nextPhase && PHASE_INFO[nextPhase as keyof typeof PHASE_INFO].name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-400 mb-1">Exit Criteria</p>
                  <p className="text-xs text-yellow-300">
                    Please ensure all exit criteria for {PHASE_INFO[currentPhase as keyof typeof PHASE_INFO].name} are
                    met before transitioning.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Transition Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Document any important details about this phase transition..."
                value={transitionNotes}
                onChange={(e) => setTransitionNotes(e.target.value)}
                className="bg-black/40 border-white/10 min-h-[100px]"
              />
            </div>

            <Button
              onClick={handleTransition}
              className="w-full bg-blue-500 hover:bg-blue-600"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Transitioning...' : 'Confirm Transition'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
