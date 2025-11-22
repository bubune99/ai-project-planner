"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Target, Users, DollarSign, TrendingUp, AlertTriangle, X, Plus, Save, Sparkles } from "lucide-react"

interface BusinessContextFormProps {
  projectId: string
  onSave?: () => void
}

interface SuccessMetric {
  metric: string
  target: number
  current: number
}

interface RiskAssessment {
  risk: string
  impact: "high" | "medium" | "low"
  mitigation: string
}

interface Stakeholder {
  name: string
  role: string
  priority: "primary" | "secondary"
}

export function BusinessContextForm({ projectId, onSave }: BusinessContextFormProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    vision: "",
    target_market: "",
    primary_use_case: "",
    revenue_model: "",
    competitive_advantage: "",
  })
  const [successMetrics, setSuccessMetrics] = useState<SuccessMetric[]>([])
  const [risks, setRisks] = useState<RiskAssessment[]>([])
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([])
  const [budgetInfo, setBudgetInfo] = useState({
    total: 0,
    allocated: 0,
    spent: 0,
  })

  useEffect(() => {
    fetchBusinessContext()
  }, [projectId])

  const fetchBusinessContext = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/business-context`)
      if (response.ok) {
        const data = await response.json()
        if (data.businessContext) {
          setFormData({
            vision: data.businessContext.vision || "",
            target_market: data.businessContext.target_market || "",
            primary_use_case: data.businessContext.primary_use_case || "",
            revenue_model: data.businessContext.revenue_model || "",
            competitive_advantage: data.businessContext.competitive_advantage || "",
          })
          setSuccessMetrics(data.businessContext.success_metrics || [])
          setRisks(data.businessContext.risk_assessment || [])
          setStakeholders(data.businessContext.stakeholders || [])
          setBudgetInfo(data.businessContext.budget_info || { total: 0, allocated: 0, spent: 0 })
        }
      }
    } catch (error) {
      console.error("[v0] Failed to fetch business context:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/business-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          success_metrics: successMetrics,
          risk_assessment: risks,
          stakeholders,
          budget_info: budgetInfo,
        }),
      })

      if (response.ok) {
        onSave?.()
      }
    } catch (error) {
      console.error("[v0] Failed to save business context:", error)
    } finally {
      setSaving(false)
    }
  }

  const addMetric = () => {
    setSuccessMetrics([...successMetrics, { metric: "", target: 0, current: 0 }])
  }

  const addRisk = () => {
    setRisks([...risks, { risk: "", impact: "medium", mitigation: "" }])
  }

  const addStakeholder = () => {
    setStakeholders([...stakeholders, { name: "", role: "", priority: "secondary" }])
  }

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Business Context</h2>
          <p className="text-muted-foreground">Define the strategic vision and business model for your project</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-500 hover:bg-blue-600 text-white">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="vision" className="w-full">
        <TabsList className="bg-black/40 border border-white/10">
          <TabsTrigger value="vision">Vision & Strategy</TabsTrigger>
          <TabsTrigger value="metrics">Success Metrics</TabsTrigger>
          <TabsTrigger value="risks">Risks</TabsTrigger>
          <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        {/* Vision & Strategy */}
        <TabsContent value="vision" className="space-y-6">
          <Card className="bg-black/40 border-white/10 p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-500" />
                <Label className="text-white">Vision Statement</Label>
              </div>
              <Textarea
                placeholder="What are we building and why? What problem does it solve?"
                value={formData.vision}
                onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                className="bg-black/40 border-white/10 min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <Label className="text-white">Target Market</Label>
              </div>
              <Textarea
                placeholder="Who is this for? Describe your ideal users/customers..."
                value={formData.target_market}
                onChange={(e) => setFormData({ ...formData, target_market: e.target.value })}
                className="bg-black/40 border-white/10 min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Primary Use Case</Label>
              <Textarea
                placeholder="What's the main problem this solves? What's the core user journey?"
                value={formData.primary_use_case}
                onChange={(e) => setFormData({ ...formData, primary_use_case: e.target.value })}
                className="bg-black/40 border-white/10 min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-yellow-500" />
                <Label className="text-white">Revenue Model</Label>
              </div>
              <Textarea
                placeholder="How does this make money? Subscription, ads, freemium, etc."
                value={formData.revenue_model}
                onChange={(e) => setFormData({ ...formData, revenue_model: e.target.value })}
                className="bg-black/40 border-white/10 min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <Label className="text-white">Competitive Advantage</Label>
              </div>
              <Textarea
                placeholder="Why choose us vs competitors? What makes this unique?"
                value={formData.competitive_advantage}
                onChange={(e) => setFormData({ ...formData, competitive_advantage: e.target.value })}
                className="bg-black/40 border-white/10 min-h-[100px]"
              />
            </div>
          </Card>
        </TabsContent>

        {/* Success Metrics */}
        <TabsContent value="metrics" className="space-y-4">
          <Card className="bg-black/40 border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <Label className="text-white">Success Metrics</Label>
              </div>
              <Button
                size="sm"
                onClick={addMetric}
                variant="outline"
                className="border-white/10 hover:bg-white/5 bg-transparent"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Metric
              </Button>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4">
                {successMetrics.map((metric, index) => (
                  <div key={index} className="flex items-start gap-4 bg-black/60 p-4 rounded-lg">
                    <div className="flex-1 space-y-3">
                      <Input
                        placeholder="Metric name (e.g., Active Users)"
                        value={metric.metric}
                        onChange={(e) => {
                          const newMetrics = [...successMetrics]
                          newMetrics[index].metric = e.target.value
                          setSuccessMetrics(newMetrics)
                        }}
                        className="bg-black/40 border-white/10"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          type="number"
                          placeholder="Target"
                          value={metric.target}
                          onChange={(e) => {
                            const newMetrics = [...successMetrics]
                            newMetrics[index].target = Number.parseFloat(e.target.value)
                            setSuccessMetrics(newMetrics)
                          }}
                          className="bg-black/40 border-white/10"
                        />
                        <Input
                          type="number"
                          placeholder="Current"
                          value={metric.current}
                          onChange={(e) => {
                            const newMetrics = [...successMetrics]
                            newMetrics[index].current = Number.parseFloat(e.target.value)
                            setSuccessMetrics(newMetrics)
                          }}
                          className="bg-black/40 border-white/10"
                        />
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setSuccessMetrics(successMetrics.filter((_, i) => i !== index))}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* Risks */}
        <TabsContent value="risks" className="space-y-4">
          <Card className="bg-black/40 border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <Label className="text-white">Risk Assessment</Label>
              </div>
              <Button
                size="sm"
                onClick={addRisk}
                variant="outline"
                className="border-white/10 hover:bg-white/5 bg-transparent"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Risk
              </Button>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4">
                {risks.map((risk, index) => (
                  <div key={index} className="bg-black/60 p-4 rounded-lg space-y-3">
                    <div className="flex gap-4">
                      <Input
                        placeholder="Risk description"
                        value={risk.risk}
                        onChange={(e) => {
                          const newRisks = [...risks]
                          newRisks[index].risk = e.target.value
                          setRisks(newRisks)
                        }}
                        className="flex-1 bg-black/40 border-white/10"
                      />
                      <select
                        value={risk.impact}
                        onChange={(e: any) => {
                          const newRisks = [...risks]
                          newRisks[index].impact = e.target.value
                          setRisks(newRisks)
                        }}
                        className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setRisks(risks.filter((_, i) => i !== index))}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Mitigation strategy..."
                      value={risk.mitigation}
                      onChange={(e) => {
                        const newRisks = [...risks]
                        newRisks[index].mitigation = e.target.value
                        setRisks(newRisks)
                      }}
                      className="bg-black/40 border-white/10"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* Stakeholders */}
        <TabsContent value="stakeholders" className="space-y-4">
          <Card className="bg-black/40 border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-white">Stakeholders</Label>
              <Button
                size="sm"
                onClick={addStakeholder}
                variant="outline"
                className="border-white/10 hover:bg-white/5 bg-transparent"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stakeholder
              </Button>
            </div>

            <div className="space-y-3">
              {stakeholders.map((stakeholder, index) => (
                <div key={index} className="flex items-center gap-4 bg-black/60 p-4 rounded-lg">
                  <Input
                    placeholder="Name"
                    value={stakeholder.name}
                    onChange={(e) => {
                      const newStakeholders = [...stakeholders]
                      newStakeholders[index].name = e.target.value
                      setStakeholders(newStakeholders)
                    }}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="Role"
                    value={stakeholder.role}
                    onChange={(e) => {
                      const newStakeholders = [...stakeholders]
                      newStakeholders[index].role = e.target.value
                      setStakeholders(newStakeholders)
                    }}
                    className="bg-black/40 border-white/10"
                  />
                  <select
                    value={stakeholder.priority}
                    onChange={(e: any) => {
                      const newStakeholders = [...stakeholders]
                      newStakeholders[index].priority = e.target.value
                      setStakeholders(newStakeholders)
                    }}
                    className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                  >
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setStakeholders(stakeholders.filter((_, i) => i !== index))}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Budget */}
        <TabsContent value="budget" className="space-y-4">
          <Card className="bg-black/40 border-white/10 p-6 space-y-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <Label className="text-white">Budget Information</Label>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Total Budget</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={budgetInfo.total}
                  onChange={(e) => setBudgetInfo({ ...budgetInfo, total: Number.parseFloat(e.target.value) || 0 })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Allocated</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={budgetInfo.allocated}
                  onChange={(e) => setBudgetInfo({ ...budgetInfo, allocated: Number.parseFloat(e.target.value) || 0 })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Spent</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={budgetInfo.spent}
                  onChange={(e) => setBudgetInfo({ ...budgetInfo, spent: Number.parseFloat(e.target.value) || 0 })}
                  className="bg-black/40 border-white/10"
                />
              </div>
            </div>

            {/* Budget visualization */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Budget Usage</span>
                <span className="text-white">
                  ${budgetInfo.spent.toLocaleString()} / ${budgetInfo.total.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
                <div
                  className="bg-blue-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (budgetInfo.spent / budgetInfo.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
