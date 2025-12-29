"use client"

import { Copy, ExternalLink, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import mermaid from "mermaid"
import { useEffect, useRef } from "react"

interface DocsContentProps {
  title: string
  content: string
  lastUpdated?: string
  updatedBy?: string
  onEditInVSCode?: () => void
  onCopyLink?: () => void
  onViewHistory?: () => void
}

export function DocsContent({ title, content, lastUpdated = "2 days ago", updatedBy = "@claude", onEditInVSCode, onCopyLink, onViewHistory }: DocsContentProps) {
  const mermaidRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mermaid.initialize({ theme: "dark", startOnLoad: true })
    if (mermaidRef.current) {
      mermaid.contentLoaded()
    }
  }, [content])

  return (
    <div className="flex-1 min-w-0">
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-muted-foreground">
        <span>Docs</span>
        <span className="mx-2">&gt;</span>
        <span>Architecture</span>
        <span className="mx-2">&gt;</span>
        <span className="text-foreground">{title}</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/50">
        <div className="text-sm text-muted-foreground">
          Last updated: {lastUpdated} by {updatedBy}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEditInVSCode}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Edit in VS Code
          </Button>
          <Button variant="outline" size="sm" onClick={onCopyLink}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>
          <Button variant="outline" size="sm" onClick={onViewHistory}>
            <History className="w-4 h-4 mr-2" />
            View History
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="prose prose-invert max-w-[900px] mx-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "")
              const language = match ? match[1] : ""

              if (language === "mermaid") {
                return (
                  <div ref={mermaidRef} className="mermaid my-6">
                    {String(children).replace(/\n$/, "")}
                  </div>
                )
              }

              return !inline && match ? (
                <div className="relative my-4 rounded-lg bg-[#1e1e1e] border border-border/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-accent/30 border-b border-border/50">
                    <span className="text-xs text-muted-foreground font-mono">{language}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => navigator.clipboard.writeText(String(children))}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <pre className="p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-gray-300" {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              ) : (
                <code className="bg-accent px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              )
            },
            h1: ({ children }) => <h1 className="text-4xl font-bold text-foreground mb-6 mt-8">{children}</h1>,
            h2: ({ children }) => {
              const id = `heading-${String(children).toLowerCase().replace(/\s+/g, "-")}`
              return (
                <h2 id={id} className="text-2xl font-semibold text-foreground mb-4 mt-8 scroll-mt-20">
                  {children}
                </h2>
              )
            },
            h3: ({ children }) => {
              const id = `heading-${String(children).toLowerCase().replace(/\s+/g, "-")}`
              return (
                <h3 id={id} className="text-xl font-semibold text-foreground mb-3 mt-6 scroll-mt-20">
                  {children}
                </h3>
              )
            },
            p: ({ children }) => <p className="text-muted-foreground leading-relaxed mb-4">{children}</p>,
            a: ({ children, href }) => (
              <a href={href} className="text-blue-400 hover:text-blue-300 underline">
                {children}
              </a>
            ),
            ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-2">{children}</ol>,
            li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
            table: ({ children }) => (
              <div className="overflow-x-auto my-6">
                <table className="w-full border-collapse border border-border">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-accent">{children}</thead>,
            th: ({ children }) => (
              <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">{children}</th>
            ),
            td: ({ children }) => <td className="border border-border px-4 py-2 text-muted-foreground">{children}</td>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-accent/30 rounded-r">
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
