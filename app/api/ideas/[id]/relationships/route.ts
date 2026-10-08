import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { RelationshipsService } from "@/lib/services/relationships"
import { sql } from "@/lib/db/client"

export const dynamic = "force-dynamic"

/**
 * Verify user has access to an idea (same check as the sibling idea routes)
 */
async function verifyIdeaAccess(ideaId: string, userId: string): Promise<boolean> {
  const result = (await sql`
    SELECT id FROM ideas
    WHERE id = ${ideaId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
  `) as Record<string, unknown>[]
  return result.length > 0
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ideaId } = await params
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    if (!(await verifyIdeaAccess(ideaId, auth.userId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 })
    }

    const relationships = await RelationshipsService.list(ideaId)

    return NextResponse.json({
      success: true,
      data: relationships,
    })
  } catch (error) {
    console.error("Error fetching relationships:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch relationships" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ideaId } = await params
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    if (!(await verifyIdeaAccess(ideaId, auth.userId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 })
    }

    const body = await request.json()
    const { action } = body

    switch (action) {
      case "spawn": {
        const { title, description, inheritOptions } = body
        if (!title) {
          return NextResponse.json(
            { success: false, error: "Title is required" },
            { status: 400 }
          )
        }

        const result = await RelationshipsService.spawnChild(
          auth.userId,
          ideaId,
          title,
          description || "",
          inheritOptions || {}
        )

        return NextResponse.json({
          success: true,
          data: result,
        })
      }

      case "merge": {
        const { targetIdeaId, strategy, archiveSource } = body
        if (!targetIdeaId) {
          return NextResponse.json(
            { success: false, error: "Target idea ID is required" },
            { status: 400 }
          )
        }
        if (!(await verifyIdeaAccess(targetIdeaId, auth.userId))) {
          return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 })
        }

        const result = await RelationshipsService.mergeIdeas(
          ideaId,
          targetIdeaId,
          strategy || "keep-both",
          archiveSource !== false
        )

        return NextResponse.json({
          success: true,
          data: result,
        })
      }

      case "evolved-into": {
        const { targetIdeaId, notes } = body
        if (!targetIdeaId) {
          return NextResponse.json(
            { success: false, error: "Target idea ID is required" },
            { status: 400 }
          )
        }
        if (!(await verifyIdeaAccess(targetIdeaId, auth.userId))) {
          return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 })
        }

        const relationship = await RelationshipsService.markEvolvedInto(
          ideaId,
          targetIdeaId,
          notes
        )

        return NextResponse.json({
          success: true,
          data: relationship,
        })
      }

      case "create": {
        const { to_idea_id, relationship_type, metadata } = body
        if (!to_idea_id || !relationship_type) {
          return NextResponse.json(
            { success: false, error: "to_idea_id and relationship_type are required" },
            { status: 400 }
          )
        }
        if (!(await verifyIdeaAccess(to_idea_id, auth.userId))) {
          return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 })
        }

        const relationship = await RelationshipsService.create(ideaId, {
          to_idea_id,
          relationship_type,
          metadata,
        })

        return NextResponse.json({
          success: true,
          data: relationship,
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("Error handling relationship action:", error)
    return NextResponse.json(
      { success: false, error: "Failed to perform relationship action" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const relationshipId = searchParams.get("relationshipId")

    if (!relationshipId) {
      return NextResponse.json(
        { success: false, error: "Relationship ID is required" },
        { status: 400 }
      )
    }

    // The relationship must touch one of the caller's ideas; otherwise 404
    const owned = (await sql`
      SELECT 1 FROM idea_relationships r
      JOIN ideas i ON i.id IN (r.from_idea_id, r.to_idea_id)
      WHERE r.id = ${relationshipId}
        AND i.user_id = ${auth.userId}
        AND i.deleted_at IS NULL
      LIMIT 1
    `) as Record<string, unknown>[]
    if (owned.length === 0) {
      return NextResponse.json({ success: false, error: "Relationship not found" }, { status: 404 })
    }

    const deleted = await RelationshipsService.delete(relationshipId)

    return NextResponse.json({
      success: true,
      data: { deleted },
    })
  } catch (error) {
    console.error("Error deleting relationship:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete relationship" },
      { status: 500 }
    )
  }
}
