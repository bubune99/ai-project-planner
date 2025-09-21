"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Film,
  Map,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  Play,
  Settings,
  ChevronLeft,
  ChevronRight,
  Kanban,
  ArrowUpDown,
  ArrowLeftRight,
} from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  ReactFlow,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

const projectSteps = [
  {
    id: "requirements",
    title: "Requirements Gathering",
    status: "completed",
    progress: 100,
    canWork: false,
    shouldWork: false,
    inProgress: false,
    blocked: false,
    dependencies: [],
    tasks: ["Business requirements", "User stories", "Technical specs", "Stakeholder interviews", "Market research"],
    description: "Define project scope and requirements",
    estimatedHours: 16,
    actualHours: 18,
    phase: "Planning",
    stage: "Discovery",
  },
  {
    id: "design",
    title: "UI/UX Design",
    status: "completed",
    progress: 100,
    canWork: false,
    shouldWork: false,
    inProgress: false,
    blocked: false,
    dependencies: ["requirements"],
    tasks: ["Wireframes", "Mockups", "Design system", "User flow diagrams", "Prototyping"],
    description: "Create user interface and experience design",
    estimatedHours: 24,
    actualHours: 22,
    phase: "Design",
    stage: "Visual Design",
  },
  {
    id: "frontend-setup",
    title: "Frontend Foundation",
    status: "in-progress",
    progress: 75,
    canWork: true,
    shouldWork: true,
    inProgress: true,
    blocked: false,
    dependencies: ["design"],
    tasks: ["Project setup", "Component library", "Routing", "State management", "Build configuration"],
    description: "Set up frontend architecture and core components",
    estimatedHours: 32,
    actualHours: 24,
    phase: "Development",
    stage: "Frontend",
  },
  {
    id: "backend-setup",
    title: "Backend Foundation",
    status: "in-progress",
    progress: 60,
    canWork: true,
    shouldWork: false,
    inProgress: true,
    blocked: false,
    dependencies: ["requirements"],
    tasks: ["Database schema", "API structure", "Authentication", "Middleware", "Security setup"],
    description: "Set up backend services and database",
    estimatedHours: 40,
    actualHours: 28,
    phase: "Development",
    stage: "Backend",
  },
  {
    id: "api-integration",
    title: "API Integration",
    status: "pending",
    progress: 0,
    canWork: false,
    shouldWork: false,
    inProgress: false,
    blocked: true,
    dependencies: ["frontend-setup", "backend-setup"],
    tasks: [
      "Connect frontend to API",
      "Error handling",
      "Loading states",
      "Data validation",
      "Performance optimization",
    ],
    description: "Integrate frontend with backend services",
    estimatedHours: 20,
    actualHours: 0,
    phase: "Development",
    stage: "Integration",
  },
  {
    id: "testing",
    title: "Testing & QA",
    status: "pending",
    progress: 0,
    canWork: false,
    shouldWork: false,
    inProgress: false,
    blocked: true,
    dependencies: ["api-integration"],
    tasks: ["Unit tests", "Integration tests", "E2E tests", "Performance testing", "Security testing"],
    description: "Comprehensive testing of all features",
    estimatedHours: 24,
    actualHours: 0,
    phase: "Testing",
    stage: "Quality Assurance",
  },
  {
    id: "deployment",
    title: "Deployment",
    status: "pending",
    progress: 0,
    canWork: false,
    shouldWork: false,
    inProgress: false,
    blocked: true,
    dependencies: ["testing"],
    tasks: ["Production setup", "CI/CD", "Monitoring", "Documentation", "Launch preparation"],
    description: "Deploy to production environment",
    estimatedHours: 16,
    actualHours: 0,
    phase: "Deployment",
    stage: "Production",
  },
]

const getStatusColor = (step: any) => {
  if (step.status === "completed") return "bg-green-500"
  if (step.inProgress) return "bg-blue-500"
  if (step.shouldWork) return "bg-yellow-500"
  if (step.canWork) return "bg-cyan-500"
  if (step.blocked) return "bg-red-500"
  return "bg-gray-400"
}

const getStatusIcon = (step: any) => {
  if (step.status === "completed") return <CheckCircle className="h-4 w-4" />
  if (step.inProgress) return <Clock className="h-4 w-4" />
  if (step.blocked) return <AlertTriangle className="h-4 w-4" />
  return <Circle className="h-4 w-4" />
}

const CustomProjectNode = ({ data }: { data: any }) => {
  const { step, onClick } = data

  return (
    <div
      className={`px-4 py-3 shadow-lg rounded-lg border-2 cursor-pointer transition-all hover:shadow-xl min-w-[200px] ${
        step.inProgress ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
      }`}
      onClick={() => onClick(step)}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor(step)}`} />
        <h3 className="font-semibold text-sm">{step.title}</h3>
      </div>

      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{step.description}</p>

      <div className="space-y-1">
        <Progress value={step.progress} className="h-1" />
        <div className="flex justify-between text-xs">
          <span>{step.progress}%</span>
          <span>{step.estimatedHours}h</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  )
}

const nodeTypes = {
  projectStep: CustomProjectNode,
}

export function ProjectExecutionView() {
  const [currentStep, setCurrentStep] = useState(2)
  const [viewMode, setViewMode] = useState<"film" | "map">("film")
  const [scrollDirection, setScrollDirection] = useState<"horizontal" | "vertical">("horizontal")

  useEffect(() => {
    const handleResizeObserverError = (e: ErrorEvent) => {
      if (e.message === "ResizeObserver loop completed with undelivered notifications.") {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener("error", handleResizeObserverError)
    return () => window.removeEventListener("error", handleResizeObserverError)
  }, [])

  const handleNodeClick = useCallback((clickedStep: any) => {
    const stepIndex = projectSteps.findIndex((s) => s.id === clickedStep.id)
    setCurrentStep(stepIndex)
  }, [])

  const initialNodes: Node[] = useMemo(
    () =>
      projectSteps.map((step, index) => ({
        id: step.id,
        type: "projectStep",
        position: {
          x: (index % 3) * 250,
          y: Math.floor(index / 3) * 150,
        },
        data: {
          step,
          onClick: handleNodeClick,
        },
      })),
    [handleNodeClick],
  )

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    projectSteps.forEach((step) => {
      step.dependencies.forEach((depId) => {
        edges.push({
          id: `${depId}-${step.id}`,
          source: depId,
          target: step.id,
          type: "smoothstep",
          animated: step.inProgress,
          style: { stroke: step.blocked ? "#ef4444" : "#6b7280" },
        })
      })
    })
    return edges
  }, [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onNodesChangeCallback = useCallback(
    (changes: any) => {
      onNodesChange(changes)
    },
    [onNodesChange],
  )

  const onEdgesChangeCallback = useCallback(
    (changes: any) => {
      onEdgesChange(changes)
    },
    [onEdgesChange],
  )

  const FilmRollView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="transition-all hover:scale-105"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {projectSteps.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStep(Math.min(projectSteps.length - 1, currentStep + 1))}
            disabled={currentStep === projectSteps.length - 1}
            className="transition-all hover:scale-105"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScrollDirection(scrollDirection === "horizontal" ? "vertical" : "horizontal")}
            className="transition-all hover:scale-105 bg-transparent"
          >
            {scrollDirection === "horizontal" ? (
              <ArrowLeftRight className="h-4 w-4 mr-2" />
            ) : (
              <ArrowUpDown className="h-4 w-4 mr-2" />
            )}
            {scrollDirection === "horizontal" ? "Horizontal" : "Vertical"}
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="transition-all hover:scale-105 bg-transparent">
                <Kanban className="h-4 w-4 mr-2" />
                Open Kanban
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[600px] sm:w-[800px]">
              <SheetHeader>
                <SheetTitle>{projectSteps[currentStep].title} - Tasks</SheetTitle>
                <SheetDescription>Manage tasks for the current development step</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {projectSteps[currentStep].tasks.map((task, index) => (
                  <Card key={index} className="p-4 transition-all hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span>{task}</span>
                      <Badge variant={index < 2 ? "default" : "outline"}>{index < 2 ? "Done" : "Todo"}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="border-2 border-primary transition-all duration-300 hover:shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`transition-all duration-300 ${projectSteps[currentStep].inProgress ? "animate-pulse" : ""}`}
              >
                {getStatusIcon(projectSteps[currentStep])}
              </div>
              <div>
                <CardTitle className="text-balance">{projectSteps[currentStep].title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {projectSteps[currentStep].phase}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {projectSteps[currentStep].stage}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-2 transition-all hover:scale-105">
                <Play className="h-4 w-4" />
                Continue Work
              </Button>
              <Button variant="outline" size="sm" className="transition-all hover:scale-105 bg-transparent">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{projectSteps[currentStep].description}</p>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{projectSteps[currentStep].progress}%</span>
              </div>
              <Progress value={projectSteps[currentStep].progress} className="h-2 transition-all duration-300" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Estimated:</span> {projectSteps[currentStep].estimatedHours}h
              </div>
              <div>
                <span className="text-muted-foreground">Actual:</span> {projectSteps[currentStep].actualHours}h
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-muted">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Project Timeline</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Completed</span>
              <div className="w-2 h-2 rounded-full bg-blue-500 ml-2" />
              <span>In Progress</span>
              <div className="w-2 h-2 rounded-full bg-red-500 ml-2" />
              <span>Blocked</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Film Roll Viewport Container */}
          <div className="relative">
            {/* Infinite Scroll Container */}
            <div
              className={`relative border-2 border-red-500/20 rounded-lg bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10 ${
                scrollDirection === "horizontal"
                  ? "h-48 overflow-x-auto overflow-y-hidden"
                  : "h-[600px] overflow-y-auto overflow-x-hidden"
              }`}
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgb(239 68 68 / 0.3) transparent",
              }}
            >
              {/* Scroll Content Area */}
              <div
                className={`p-6 ${
                  scrollDirection === "horizontal" ? "flex gap-6 h-full items-center" : "space-y-6 min-h-full"
                } transition-all duration-500`}
                style={{
                  width: scrollDirection === "horizontal" ? `${projectSteps.length * 280 + 200}px` : "100%",
                  minHeight: scrollDirection === "vertical" ? `${projectSteps.length * 200 + 200}px` : "100%",
                }}
              >
                {/* Infinite scroll effect - duplicate first few items at the end */}
                {[...projectSteps, ...projectSteps.slice(0, 2)].map((step, index) => {
                  const isOriginal = index < projectSteps.length
                  const originalIndex = index % projectSteps.length

                  return (
                    <div
                      key={`${step.id}-${index}`}
                      className={`relative flex-shrink-0 rounded-xl border-2 cursor-pointer transition-all duration-500 hover:scale-105 hover:shadow-xl bg-background/95 backdrop-blur-sm ${
                        scrollDirection === "horizontal" ? "w-64 h-36" : "w-full h-32"
                      } ${
                        originalIndex === currentStep && isOriginal
                          ? "border-primary shadow-2xl ring-4 ring-primary/30 scale-105"
                          : "border-border/50 hover:border-primary/50 shadow-lg"
                      } ${!isOriginal ? "opacity-60" : ""}`}
                      onClick={() => isOriginal && setCurrentStep(originalIndex)}
                    >
                      {/* Phase Badge */}
                      <div className="absolute -top-3 -right-3 flex gap-1 z-10">
                        <Badge
                          variant="secondary"
                          className={`text-xs px-2 py-1 h-6 shadow-md ${
                            step.phase === "Planning"
                              ? "bg-purple-100 text-purple-700"
                              : step.phase === "Design"
                                ? "bg-pink-100 text-pink-700"
                                : step.phase === "Development"
                                  ? "bg-blue-100 text-blue-700"
                                  : step.phase === "Testing"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-green-100 text-green-700"
                          }`}
                        >
                          {step.phase}
                        </Badge>
                      </div>

                      {/* Content Container with Individual Scroll */}
                      <div className="p-4 h-full flex flex-col justify-between overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <div
                            className={`w-4 h-4 rounded-full transition-all duration-500 shadow-lg ${getStatusColor(step)} ${
                              step.inProgress ? "animate-pulse ring-2 ring-current ring-opacity-50" : ""
                            }`}
                          />
                          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-background/80">
                            {step.stage}
                          </Badge>
                        </div>

                        {/* Scrollable Content Area */}
                        <div
                          className={`flex-1 overflow-hidden ${
                            scrollDirection === "horizontal" ? "max-h-16" : "max-h-12"
                          }`}
                        >
                          <div className="text-sm font-semibold truncate mb-2 text-foreground">{step.title}</div>
                          <div
                            className="text-xs text-muted-foreground overflow-y-auto pr-1"
                            style={{
                              scrollbarWidth: "thin",
                              scrollbarColor: "rgb(156 163 175 / 0.3) transparent",
                              maxHeight: scrollDirection === "horizontal" ? "2.5rem" : "1.5rem",
                            }}
                          >
                            {step.description}
                          </div>
                        </div>

                        {/* Progress Section */}
                        <div className="space-y-2 mt-3">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-foreground">{step.progress}%</span>
                            <span className="text-muted-foreground">{step.estimatedHours}h</span>
                          </div>
                          <Progress value={step.progress} className="h-2 bg-muted/50" />
                        </div>
                      </div>

                      {/* Dependency Indicators */}
                      {step.dependencies.length > 0 && (
                        <div
                          className={`absolute ${
                            scrollDirection === "horizontal"
                              ? "-left-3 top-1/2 transform -translate-y-1/2"
                              : "-top-3 left-1/2 transform -translate-x-1/2"
                          }`}
                        >
                          <div
                            className={`${
                              scrollDirection === "horizontal" ? "w-6 h-1" : "w-1 h-6"
                            } ${step.blocked ? "bg-red-500" : "bg-green-500"} rounded-full shadow-md`}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Scroll Indicators */}
              <div
                className={`absolute ${
                  scrollDirection === "horizontal"
                    ? "right-4 top-1/2 transform -translate-y-1/2"
                    : "bottom-4 left-1/2 transform -translate-x-1/2"
                } text-red-500/60 animate-pulse`}
              >
                {scrollDirection === "horizontal" ? (
                  <ChevronRight className="h-6 w-6" />
                ) : (
                  <ArrowUpDown className="h-6 w-6" />
                )}
              </div>
            </div>

            {/* Scroll Area Indicator */}
            <div className="absolute -top-1 -left-1 -right-1 h-1 bg-red-500/30 rounded-t-lg" />
            <div className="absolute -bottom-1 -left-1 -right-1 h-1 bg-red-500/30 rounded-b-lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const MapView = () => (
    <div className="space-y-4">
      <div className="h-[600px] border rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeCallback}
          onEdgesChange={onEdgesChangeCallback}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-50"
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.5}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Controls className="bg-white border rounded shadow-lg" />
          <MiniMap
            className="bg-white border rounded shadow-lg"
            nodeColor={(node) => {
              const step = projectSteps.find((s) => s.id === node.id)
              return step ? getStatusColor(step).replace("bg-", "#") : "#gray"
            }}
            pannable={false}
            zoomable={false}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Status Legend</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Should Work</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span>Can Work</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Blocked</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <Card className="transition-all duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-balance">Project Execution</CardTitle>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "film" | "map")}>
            <TabsList>
              <TabsTrigger value="film" className="gap-2 transition-all">
                <Film className="h-4 w-4" />
                Film Roll
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-2 transition-all">
                <Map className="h-4 w-4" />
                Project Map
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>{viewMode === "film" ? <FilmRollView /> : <MapView />}</CardContent>
    </Card>
  )
}
