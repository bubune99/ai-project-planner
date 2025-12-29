"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Copy, Check, Download, Send, RefreshCw } from "lucide-react"

interface PromptGeneratorProps {
  projectId: string
  stepId?: string
  type?: "task" | "phase" | "project"
  onSendToClaudeCode?: (prompt: string) => void
}

export function PromptGenerator({ projectId, stepId, type = "task", onSendToClaudeCode }: PromptGeneratorProps) {
  const [prompt, setPrompt] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [promptData, setPromptData] = useState<any>(null)

  useEffect(() => {
    generatePrompt()
  }, [projectId, stepId, type])

  const generatePrompt = async () => {
    setLoading(true)
    try {
      const url = stepId
        ? `/api/prompts/generate?projectId=${projectId}&stepId=${stepId}&type=${type}`
        : `/api/prompts/generate?projectId=${projectId}&type=${type}`

      const response = await fetch(url)
      const data = await response.json()

      setPromptData(data)
      setPrompt(data.prompt)
    } catch (error) {
      console.error("[v0] Failed to generate prompt:", error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadPrompt = () => {
    const blob = new Blob([prompt], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ai-instructions-${Date.now()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-white">AI Agent Instructions</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generatePrompt}
            disabled={loading}
            className="border-white/10 hover:bg-white/5 bg-transparent"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Prompt Display */}
      <Tabs defaultValue="formatted" className="w-full">
        <TabsList className="bg-black/40 border border-white/10">
          <TabsTrigger value="formatted">Formatted</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="formatted" className="space-y-4">
          <div className="bg-black/40 border border-white/10 rounded-lg p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-4" />
                <p className="text-muted-foreground">Generating comprehensive instructions...</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="prose prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-gray-300">{prompt}</pre>
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button onClick={copyToClipboard} className="bg-blue-500 hover:bg-blue-600 text-white">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={downloadPrompt}
              className="border-white/10 hover:bg-white/5 bg-transparent"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" className="border-white/10 hover:bg-white/5 bg-transparent" onClick={() => onSendToClaudeCode?.(prompt)}>
              <Send className="h-4 w-4 mr-2" />
              Send to Claude Code
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="markdown">
          <div className="bg-black/40 border border-white/10 rounded-lg p-4">
            <ScrollArea className="h-[600px]">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{prompt}</pre>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <div className="bg-black/40 border border-white/10 rounded-lg p-6">
            <ScrollArea className="h-[600px]">
              {promptData && (
                <div className="space-y-6">
                  {/* Context Summary */}
                  <div className="border-b border-white/10 pb-4">
                    <h4 className="text-white font-semibold mb-2">Context Included:</h4>
                    <div className="flex flex-wrap gap-2">
                      {promptData.hasBusinessContext && (
                        <Badge variant="secondary" className="bg-blue-500/20 text-blue-300">
                          Business Context
                        </Badge>
                      )}
                      {promptData.hasTechStack && (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-300">
                          Tech Stack
                        </Badge>
                      )}
                      {promptData.hasDependencies && (
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300">
                          Dependencies
                        </Badge>
                      )}
                      {promptData.hasAcceptanceCriteria && (
                        <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">
                          Acceptance Criteria
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Formatted Preview */}
                  <div className="prose prose-invert max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: promptData.htmlPreview || "" }} />
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
