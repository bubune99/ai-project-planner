import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    const [page] = await sql`
      SELECT * FROM documents
      WHERE id = ${params.pageId}::uuid
        AND deleted_at IS NULL
    `

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[v0] Failed to fetch page:", error)
    return NextResponse.json({ error: "Failed to fetch page" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    const body = await request.json()
    const { title, content, icon } = body

    const [page] = await sql`
      UPDATE documents
      SET
        title = COALESCE(${title}, title),
        content = COALESCE(${content}, content),
        file_size = COALESCE(${content?.length}, file_size),
        updated_at = NOW()
      WHERE id = ${params.pageId}::uuid
        AND deleted_at IS NULL
      RETURNING *
    `

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[v0] Failed to update page:", error)
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    await sql`
      UPDATE documents
      SET deleted_at = NOW()
      WHERE id = ${params.pageId}::uuid
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to delete page:", error)
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 })
  }
}
