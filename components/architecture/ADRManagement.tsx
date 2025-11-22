"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, FileText, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { format } from "date-fns"

interface ADR {
  id: string
  project_id: string
  title: string
  context: string
  decision: string
  consequences: string
  alternatives_considered: string[] | null
  status: "proposed" | "accepted" | "deprecated" | "superseded"
  superseded_by: string | null
  created_at: string
  updated_at: string
}

interface ADRManagementProps {
  projectId: string
}

export function ADRManagement({ projectId }: ADRManagementProps) {
  const [adrs, setAdrs] = useState<ADR[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedADR, setSelectedADR] = useState<ADR | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    context: "",
    decision: "",
    consequences: "",
    alternatives: "",
  })

  useEffect(() => {
    fetchADRs()
  }, [projectId])

  const fetchADRs = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/adrs`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch ADRs' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch ADRs`)
      }

      const data = await response.json()
      setAdrs(data.adrs || [])
    } catch (error) {
      console.error("Failed to fetch ADRs:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while fetching ADRs')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    // Validation
    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }
    if (!formData.context.trim()) {
      setError('Context is required')
      return
    }
    if (!formData.decision.trim()) {
      setError('Decision is required')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/adrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          alternatives_considered: formData.alternatives.split("\n").filter((a) => a.trim()),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create ADR' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to create ADR`)
      }

      setIsCreateModalOpen(false)
      setFormData({ title: "", context: "", decision: "", consequences: "", alternatives: "" })
      await fetchADRs()
    } catch (error) {
      console.error("Failed to create ADR:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while creating ADR')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAccept = async (adrId: string) => {
    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/adrs/${adrId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to accept ADR' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to accept ADR`)
      }

      await fetchADRs()
    } catch (error) {
      console.error("Failed to accept ADR:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while accepting ADR')
    }
  }

  const getStatusColor = (status: ADR["status"]) => {
    switch (status) {
      case "accepted":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "proposed":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "deprecated":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
      case "superseded":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
    }
  }

  const activeADRs = adrs.filter((a) => a.status === "accepted" || a.status === "proposed")
  const historicalADRs = adrs.filter((a) => a.status === "deprecated" || a.status === "superseded")

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
          <h2 className="text-2xl font-bold text-white">Architecture Decisions</h2>
          <p className="text-muted-foreground text-sm mt-1">Document and track architectural decisions and pivots</p>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600 gap-2">
              <Plus className="h-4 w-4" />
              Create ADR
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">Create Architecture Decision Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Use PostgreSQL instead of MongoDB"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="context">Context</Label>
                <Textarea
                  id="context"
                  placeholder="What is the situation and why does this decision need to be made?"
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision">Decision</Label>
                <Textarea
                  id="decision"
                  placeholder="What is the change that we're proposing and/or doing?"
                  value={formData.decision}
                  onChange={(e) => setFormData({ ...formData, decision: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consequences">Consequences</Label>
                <Textarea
                  id="consequences"
                  placeholder="What becomes easier or more difficult to do because of this change?"
                  value={formData.consequences}
                  onChange={(e) => setFormData({ ...formData, consequences: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alternatives">Alternatives Considered (one per line)</Label>
                <Textarea
                  id="alternatives"
                  placeholder="MongoDB (original choice)&#10;MySQL&#10;DynamoDB"
                  value={formData.alternatives}
                  onChange={(e) => setFormData({ ...formData, alternatives: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[80px] font-mono text-sm"
                />
              </div>
              <Button
                onClick={handleCreate}
                className="w-full bg-blue-500 hover:bg-blue-600"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create ADR'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-500/10 border-green-500/30 p-4">
          <div className="text-2xl font-bold text-green-400">
            {activeADRs.filter((a) => a.status === "accepted").length}
          </div>
          <div className="text-sm text-green-300">Accepted</div>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {activeADRs.filter((a) => a.status === "proposed").length}
          </div>
          <div className="text-sm text-yellow-300">Proposed</div>
        </Card>
        <Card className="bg-gray-500/10 border-gray-500/30 p-4">
          <div className="text-2xl font-bold text-gray-400">{historicalADRs.length}</div>
          <div className="text-sm text-gray-300">Historical</div>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading ADRs...</div>
      ) : adrs.length === 0 ? (
        <Card className="bg-gray-900/50 border-white/10 p-8 text-center">
          <p className="text-muted-foreground">No ADRs yet. Document your first architectural decision!</p>
        </Card>
      ) : (
        <>
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Active Decisions</h3>
            <div className="space-y-4">
              {activeADRs.map((adr) => (
                <Card
                  key={adr.id}
                  className="bg-gray-900/50 border-white/10 p-6 cursor-pointer hover:bg-gray-900/70 transition-colors"
                  onClick={() => setSelectedADR(adr)}
                >
                  <div className="flex items-start gap-4">
                    <FileText className="h-5 w-5 text-blue-500 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-lg font-semibold text-white">{adr.title}</h4>
                        <Badge variant="outline" className={getStatusColor(adr.status)}>
                          {adr.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm line-clamp-2 mb-3">{adr.context || 'No context provided'}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{format(new Date(adr.created_at), "MMM dd, yyyy")}</span>
                        {adr.alternatives_considered && Array.isArray(adr.alternatives_considered) && adr.alternatives_considered.length > 0 && (
                          <span>{adr.alternatives_considered.length} alternatives considered</span>
                        )}
                      </div>
                      {adr.status === "proposed" && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAccept(adr.id)
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Accept
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {historicalADRs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Historical Decisions</h3>
              <div className="space-y-4">
                {historicalADRs.map((adr) => (
                  <Card
                    key={adr.id}
                    className="bg-gray-900/30 border-white/5 p-6 opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setSelectedADR(adr)}
                  >
                    <div className="flex items-start gap-4">
                      <FileText className="h-5 w-5 text-gray-500 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-lg font-semibold text-white">{adr.title}</h4>
                          <Badge variant="outline" className={getStatusColor(adr.status)}>
                            {adr.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {format(new Date(adr.created_at), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selectedADR && (
        <Dialog open={!!selectedADR} onOpenChange={() => setSelectedADR(null)}>
          <DialogContent className="bg-gray-900 border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                {selectedADR.title}
                <Badge variant="outline" className={getStatusColor(selectedADR.status)}>
                  {selectedADR.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Context</h4>
                <p className="text-muted-foreground">{selectedADR.context || 'No context provided'}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Decision</h4>
                <p className="text-muted-foreground">{selectedADR.decision || 'No decision recorded'}</p>
              </div>
              {selectedADR.consequences && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">Consequences</h4>
                  <p className="text-muted-foreground">{selectedADR.consequences}</p>
                </div>
              )}
              {selectedADR.alternatives_considered && Array.isArray(selectedADR.alternatives_considered) && selectedADR.alternatives_considered.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">Alternatives Considered</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {selectedADR.alternatives_considered.map((alt, idx) => (
                      <li key={idx} className="text-muted-foreground">
                        {alt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-4 border-t border-white/10">
                Created {format(new Date(selectedADR.created_at), "MMMM dd, yyyy")}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
