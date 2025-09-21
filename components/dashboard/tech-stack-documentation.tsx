import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Code, Database, Cloud, Shield, Zap, CheckCircle, Clock, AlertCircle } from "lucide-react"

const techStackCategories = [
  {
    category: "Frontend",
    icon: Code,
    technologies: [
      { name: "Next.js 15", status: "implemented", reason: "App Router, Server Components, optimal performance" },
      { name: "React 18", status: "implemented", reason: "Latest features, concurrent rendering" },
      { name: "TypeScript", status: "implemented", reason: "Type safety, better developer experience" },
      { name: "Tailwind CSS", status: "implemented", reason: "Utility-first, responsive design" },
      { name: "shadcn/ui", status: "implemented", reason: "Consistent component library" },
    ],
  },
  {
    category: "Backend",
    icon: Database,
    technologies: [
      { name: "Supabase", status: "planned", reason: "PostgreSQL, Auth, Real-time subscriptions" },
      { name: "Prisma ORM", status: "considering", reason: "Type-safe database queries" },
      { name: "tRPC", status: "considering", reason: "End-to-end type safety" },
    ],
  },
  {
    category: "AI & ML",
    icon: Zap,
    technologies: [
      { name: "Vercel AI SDK", status: "planned", reason: "Unified AI interface, streaming responses" },
      { name: "OpenAI GPT-4", status: "planned", reason: "Advanced reasoning, code generation" },
      { name: "Anthropic Claude", status: "planned", reason: "Long context, detailed analysis" },
      { name: "Groq", status: "considering", reason: "Fast inference for real-time responses" },
    ],
  },
  {
    category: "Deployment",
    icon: Cloud,
    technologies: [
      { name: "Vercel", status: "implemented", reason: "Seamless Next.js deployment, edge functions" },
      { name: "GitHub Actions", status: "planned", reason: "CI/CD pipeline automation" },
      { name: "Docker", status: "considering", reason: "Containerization for complex deployments" },
    ],
  },
  {
    category: "Authentication",
    icon: Shield,
    technologies: [
      { name: "Supabase Auth", status: "planned", reason: "Built-in auth, social providers" },
      { name: "NextAuth.js", status: "considering", reason: "Flexible auth solution" },
    ],
  },
  {
    category: "Monitoring",
    icon: AlertCircle,
    technologies: [
      { name: "Vercel Analytics", status: "implemented", reason: "Performance monitoring" },
      { name: "Sentry", status: "planned", reason: "Error tracking and performance monitoring" },
      { name: "PostHog", status: "considering", reason: "Product analytics and feature flags" },
    ],
  },
]

const aiToolRecommendations = [
  {
    tool: "v0 by Vercel",
    useCase: "UI Component Generation",
    when: "Creating new components, rapid prototyping",
    why: "Generates production-ready React components with Tailwind CSS",
    integration: "Direct copy-paste or API integration",
  },
  {
    tool: "GitHub Copilot",
    useCase: "Code Completion & Logic",
    when: "Writing business logic, API routes, utility functions",
    why: "Context-aware code suggestions, reduces boilerplate",
    integration: "IDE extension",
  },
  {
    tool: "Claude (Anthropic)",
    useCase: "Architecture Planning",
    when: "System design, code reviews, documentation",
    why: "Excellent at understanding complex requirements and providing detailed analysis",
    integration: "API calls for planning features",
  },
  {
    tool: "GPT-4 (OpenAI)",
    useCase: "Problem Solving",
    when: "Debugging, optimization, feature implementation",
    why: "Strong reasoning capabilities, broad knowledge base",
    integration: "Vercel AI SDK integration",
  },
  {
    tool: "Cursor IDE",
    useCase: "Full Development Workflow",
    when: "End-to-end development, refactoring",
    why: "AI-first IDE with codebase understanding",
    integration: "Primary development environment",
  },
]

const implementationStrategy = [
  {
    phase: "Foundation Setup",
    status: "completed",
    progress: 100,
    tasks: [
      "Initialize Next.js project with TypeScript",
      "Setup Tailwind CSS and shadcn/ui",
      "Configure project structure and routing",
      "Implement basic dashboard layout",
    ],
  },
  {
    phase: "Core Features",
    status: "in-progress",
    progress: 60,
    tasks: [
      "Project management interface",
      "AI chat integration",
      "Progress tracking system",
      "Technology stack documentation",
    ],
  },
  {
    phase: "AI Integration",
    status: "planned",
    progress: 0,
    tasks: [
      "Integrate Vercel AI SDK",
      "Setup multiple AI providers",
      "Implement context management",
      "Add prompt optimization",
    ],
  },
  {
    phase: "Advanced Features",
    status: "planned",
    progress: 0,
    tasks: ["Visual project flow builder", "GitHub integration", "Team collaboration features", "Advanced analytics"],
  },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case "implemented":
    case "completed":
      return <CheckCircle className="h-4 w-4 text-accent" />
    case "planned":
    case "in-progress":
      return <Clock className="h-4 w-4 text-primary" />
    case "considering":
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    default:
      return <AlertCircle className="h-4 w-4 text-destructive" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "implemented":
    case "completed":
      return <Badge className="bg-accent text-accent-foreground">Implemented</Badge>
    case "planned":
      return <Badge variant="secondary">Planned</Badge>
    case "in-progress":
      return <Badge variant="secondary">In Progress</Badge>
    case "considering":
      return <Badge variant="outline">Considering</Badge>
    default:
      return <Badge variant="destructive">Blocked</Badge>
  }
}

export function TechStackDocumentation() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-balance">Tech Stack</CardTitle>
        <CardDescription className="text-sm">Technologies and AI tools overview</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stack" className="space-y-3">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="stack" className="text-xs">
              Stack
            </TabsTrigger>
            <TabsTrigger value="ai-tools" className="text-xs">
              AI Tools
            </TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs">
              Progress
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stack" className="space-y-3">
            <div className="space-y-3">
              {techStackCategories.slice(0, 3).map((category) => (
                <Card key={category.category} className="border-muted">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <category.icon className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{category.category}</span>
                    </div>
                    <div className="space-y-1">
                      {category.technologies.slice(0, 2).map((tech) => (
                        <div key={tech.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {getStatusIcon(tech.status)}
                            <span className="text-xs">{tech.name}</span>
                          </div>
                        </div>
                      ))}
                      {category.technologies.length > 2 && (
                        <div className="text-xs text-muted-foreground">+{category.technologies.length - 2} more</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ai-tools" className="space-y-3">
            <div className="space-y-2">
              {aiToolRecommendations.slice(0, 3).map((tool) => (
                <Card key={tool.tool} className="border-muted">
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-balance">{tool.tool}</span>
                      </div>
                      <p className="text-xs text-muted-foreground text-pretty">{tool.useCase}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div className="text-xs text-muted-foreground text-center">
                +{aiToolRecommendations.length - 3} more tools
              </div>
            </div>
          </TabsContent>

          <TabsContent value="strategy" className="space-y-3">
            <div className="space-y-2">
              {implementationStrategy.map((phase, index) => (
                <Card key={index} className="border-muted">
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(phase.status)}
                          <span className="font-medium text-sm text-balance">{phase.phase}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>Progress</span>
                          <span>{phase.progress}%</span>
                        </div>
                        <Progress value={phase.progress} className="h-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
