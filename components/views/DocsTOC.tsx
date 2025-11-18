"use client"

import { useEffect, useState } from "react"

interface Heading {
  id: string
  text: string
  level: number
}

interface DocsTOCProps {
  content: string
}

export function DocsTOC({ content }: DocsTOCProps) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    // Extract headings from markdown content
    const headingRegex = /^(#{2,3})\s+(.+)$/gm
    const matches = Array.from(content.matchAll(headingRegex))
    const extractedHeadings = matches.map((match, index) => ({
      id: `heading-${index}`,
      text: match[2],
      level: match[1].length,
    }))
    setHeadings(extractedHeadings)
  }, [content])

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
      setActiveId(id)
    }
  }

  if (headings.length < 3) return null

  return (
    <div className="w-[200px] sticky top-0 h-fit">
      <div className="p-4 bg-card/30 backdrop-blur-md rounded-lg border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-3">On This Page</h3>
        <nav className="space-y-2">
          {headings.map((heading) => (
            <button
              key={heading.id}
              onClick={() => scrollToHeading(heading.id)}
              className={`block w-full text-left text-sm transition-colors ${heading.level === 3 ? "pl-4" : ""} ${
                activeId === heading.id ? "text-blue-400 font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
