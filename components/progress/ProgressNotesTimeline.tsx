"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Bot, User, CheckCircle2, AlertTriangle, HelpCircle, Lightbulb, Clock, Plus } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ProgressNote {
  id: string
  author_type: "human" | "agent"
  author_name: string
  note_type: "progress" | "blocker" | "question" | "decision" | "completion"
  title?: string
  content: string
  created_at: string
  metadata?: any
}

interface ProgressNotesTimelineProps {
  projectId: string
  stepId?: string
}

export function ProgressNotesTimeline({ projectId, stepId }: ProgressNotesTimelineProps) {
  const [notes, setNotes] = useState<ProgressNote[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [newNote, setNewNote] = useState({
    note_type: "progress" as const,
    title: "",
    content: "",
  })

  useEffect(() => {
    fetchNotes()
  }, [projectId, stepId])

  const fetchNotes = async () => {
    try {
      const url = stepId
        ? `/api/progress-notes?projectId=${projectId}&stepId=${stepId}`
        : `/api/progress-notes?projectId=${projectId}`

      const response = await fetch(url)
      const data = await response.json()
      setNotes(data.notes || [])
    } catch (error) {
      console.error("[v0] Failed to fetch progress notes:", error)
    } finally {
      setLoading(false)
    }
  }

  const addNote = async () => {
    if (!newNote.content.trim()) return

    try {
      const response = await fetch("/api/progress-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          stepId,
          ...newNote,
          author_type: "human",
          author_name: "You",
        }),
      })

      if (response.ok) {
        setNewNote({ note_type: "progress", title: "", content: "" })
        setIsAddingNote(false)
        fetchNotes()
      }
    } catch (error) {
      console.error("[v0] Failed to add note:", error)
    }
  }

  const getNoteIcon = (noteType: string) => {
    switch (noteType) {
      case "progress":
        return <Clock className="h-4 w-4" />
      case "blocker":
        return <AlertTriangle className="h-4 w-4" />
      case "question":
        return <HelpCircle className="h-4 w-4" />
      case "decision":
        return <Lightbulb className="h-4 w-4" />
      case "completion":
        return <CheckCircle2 className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getNoteColor = (noteType: string) => {
    switch (noteType) {
      case "progress":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30"
      case "blocker":
        return "bg-red-500/20 text-red-300 border-red-500/30"
      case "question":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
      case "decision":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30"
      case "completion":
        return "bg-green-500/20 text-green-300 border-green-500/30"
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30"
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Progress Notes</h3>
        <Button
          size="sm"
          onClick={() => setIsAddingNote(!isAddingNote)}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </div>

      {/* Add Note Form */}
      {isAddingNote && (
        <div className="bg-black/40 border border-white/10 rounded-lg p-4 space-y-4">
          <div className="space-y-2">
            <Label>Note Type</Label>
            <Select
              value={newNote.note_type}
              onValueChange={(value: any) => setNewNote({ ...newNote, note_type: value })}
            >
              <SelectTrigger className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="progress">Progress Update</SelectItem>
                <SelectItem value="blocker">Blocker</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="decision">Decision</SelectItem>
                <SelectItem value="completion">Completion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <input
              type="text"
              placeholder="Brief summary..."
              value={newNote.title}
              onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              placeholder="Describe what you did, what you're working on, or any issues..."
              value={newNote.content}
              onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              className="bg-black/40 border-white/10 min-h-[120px]"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={addNote} className="bg-blue-500 hover:bg-blue-600">
              Add Note
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsAddingNote(false)}
              className="border-white/10 hover:bg-white/5"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No progress notes yet. Add one to document your work!
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="flex gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <Avatar className="h-10 w-10 bg-zinc-800 flex items-center justify-center">
                    {note.author_type === "agent" ? (
                      <Bot className="h-5 w-5 text-blue-400" />
                    ) : (
                      <User className="h-5 w-5 text-green-400" />
                    )}
                  </Avatar>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{note.author_name}</span>
                    <Badge variant="secondary" className={getNoteColor(note.note_type)}>
                      <span className="mr-1">{getNoteIcon(note.note_type)}</span>
                      {note.note_type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {note.title && <h4 className="text-white font-medium">{note.title}</h4>}

                  <div className="bg-black/40 border border-white/10 rounded-lg p-4">
                    <p className="text-gray-300 whitespace-pre-wrap">{note.content}</p>
                  </div>

                  {note.metadata && Object.keys(note.metadata).length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      <details>
                        <summary className="cursor-pointer hover:text-white">View metadata</summary>
                        <pre className="mt-2 bg-black/60 p-2 rounded text-xs">
                          {JSON.stringify(note.metadata, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
