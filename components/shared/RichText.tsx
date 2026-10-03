"use client"

/*
 * RichText — readable rendering for long free text (idea descriptions, notes).
 *
 * Markdown via react-markdown + GFM, set for reading rather than scanning:
 * 14px, 1.7 line height, full-strength text colour (the muted grey was the
 * main legibility problem), and a ~72ch measure. [[...]] cross-references
 * render as chips — see lib/rich-text.ts for why they are not links.
 */

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { prepareRichText } from "@/lib/rich-text"

export function RichText({ text, maxWidth = "72ch" }: { text: string; maxWidth?: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "oklch(0.88 0 0)", maxWidth }} data-slot="rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 0.9em" }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: "oklch(0.985 0 0)", fontWeight: 600 }}>{children}</strong>,
          h1: ({ children }) => <h3 style={{ fontSize: 16, fontWeight: 600, margin: "1.2em 0 0.5em", color: "oklch(0.985 0 0)" }}>{children}</h3>,
          h2: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "1.2em 0 0.5em", color: "oklch(0.985 0 0)" }}>{children}</h3>,
          h3: ({ children }) => <h4 style={{ fontSize: 14, fontWeight: 600, margin: "1em 0 0.4em", color: "oklch(0.985 0 0)" }}>{children}</h4>,
          ul: ({ children }) => <ul style={{ margin: "0 0 0.9em", paddingLeft: "1.3em", listStyle: "disc" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 0.9em", paddingLeft: "1.4em", listStyle: "decimal" }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "0.25em 0" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: "0 0 0.9em", padding: "2px 0 2px 12px", borderLeft: "2px solid var(--j-ring)", color: "oklch(0.75 0 0)" }}>{children}</blockquote>
          ),
          code: ({ children, className }) =>
            className ? (
              <pre style={{ margin: "0 0 0.9em", padding: 12, borderRadius: 8, background: "oklch(0.18 0 0)", overflowX: "auto", fontSize: 12.5 }}>
                <code>{children}</code>
              </pre>
            ) : (
              <code style={{ fontSize: "0.9em", padding: "1px 5px", borderRadius: 4, background: "oklch(0.24 0 0)" }}>{children}</code>
            ),
          a: ({ children, href }) =>
            href?.startsWith("#ref:") ? (
              <span
                className="j-pill j-ghost"
                title={`Reference: ${decodeURIComponent(href.slice(5))}`}
                style={{ fontSize: 11.5, verticalAlign: "1px", whiteSpace: "nowrap" }}
              >
                ↗ {children}
              </span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "oklch(0.75 0.12 250)", textDecoration: "underline" }}>
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 0.9em" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th style={{ border: "1px solid var(--j-hairline)", padding: "6px 10px", textAlign: "left" }}>{children}</th>,
          td: ({ children }) => <td style={{ border: "1px solid var(--j-hairline)", padding: "6px 10px" }}>{children}</td>,
        }}
      >
        {prepareRichText(text)}
      </ReactMarkdown>
    </div>
  )
}
