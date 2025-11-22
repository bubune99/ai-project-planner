import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function PATCH(request: NextRequest, { params }: { params: { id: string; chapterId: string } }) {
  try {
    const { chapterId } = params
    const body = await request.json()
    const { title, description, icon, order_index, is_expanded } = body

    const [chapter] = await sql`
      UPDATE doc_chapters
      SET 
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        icon = COALESCE(${icon}, icon),
        order_index = COALESCE(${order_index}, order_index),
        is_expanded = COALESCE(${is_expanded}, is_expanded),
        updated_at = NOW()
      WHERE id = ${chapterId} AND deleted_at IS NULL
      RETURNING *
    `

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 })
    }

    return NextResponse.json({ chapter })
  } catch (error) {
    console.error("[v0] Error updating doc chapter:", error)
    return NextResponse.json({ error: "Failed to update chapter" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; chapterId: string } }) {
  try {
    const { chapterId } = params

    await sql`
      UPDATE doc_chapters
      SET deleted_at = NOW()
      WHERE id = ${chapterId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting doc chapter:", error)
    return NextResponse.json({ error: "Failed to delete chapter" }, { status: 500 })
  }
}
