import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function PATCH(request: NextRequest, { params }: { params: { id: string; chapterId: string } }) {
  try {
    const body = await request.json()
    const { title, description, icon } = body

    const [chapter] = await sql`
      UPDATE documents
      SET
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        content = COALESCE(${icon}, content),
        updated_at = NOW()
      WHERE id = ${params.chapterId}::uuid
        AND deleted_at IS NULL
      RETURNING *
    `

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 })
    }

    return NextResponse.json({ chapter })
  } catch (error) {
    console.error("[v0] Failed to update chapter:", error)
    return NextResponse.json({ error: "Failed to update chapter" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; chapterId: string } }) {
  try {
    // Soft delete chapter and all its pages (cascade via parent_id)
    await sql`
      UPDATE documents
      SET deleted_at = NOW()
      WHERE id = ${params.chapterId}::uuid
         OR parent_id = ${params.chapterId}::uuid
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to delete chapter:", error)
    return NextResponse.json({ error: "Failed to delete chapter" }, { status: 500 })
  }
}
