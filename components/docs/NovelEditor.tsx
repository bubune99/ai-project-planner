"use client"

import { useEffect, useState } from "react"
import { Editor } from "novel"

interface NovelEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
}

export function NovelEditor({ initialContent = "", onChange }: NovelEditorProps) {
  const [content, setContent] = useState(initialContent)

  useEffect(() => {
    setContent(initialContent)
  }, [initialContent])

  const handleUpdate = (editor: any) => {
    // Get markdown content from the editor
    const markdown = editor?.storage?.markdown?.getMarkdown() || ""
    setContent(markdown)
    onChange?.(markdown)
  }

  return (
    <div className="relative min-h-[400px] w-full border border-border rounded-lg bg-background">
      <Editor
        defaultValue={initialContent}
        disableLocalStorage={true}
        onUpdate={handleUpdate}
        className="novel-editor"
        editorProps={{
          attributes: {
            class: "prose prose-invert prose-lg max-w-none p-4 focus:outline-none min-h-[400px]",
          },
        }}
      />
    </div>
  )
}
