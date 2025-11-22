import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    const { pageId } = params

    const [page] = await sql`
      SELECT * FROM doc_pages
      WHERE id = ${pageId} AND deleted_at IS NULL
    `

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[v0] Error fetching doc page:", error)
    return NextResponse.json({ error: "Failed to fetch page" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    const { pageId } = params
    const body = await request.json()
    const { title, slug, icon, content, order_index, last_edited_by } = body

    const [page] = await sql`
      UPDATE doc_pages
      SET 
        title = COALESCE(${title}, title),
        slug = COALESCE(${slug}, slug),
        icon = COALESCE(${icon}, icon),
        content = COALESCE(${content}, content),
        order_index = COALESCE(${order_index}, order_index),
        last_edited_by = COALESCE(${last_edited_by}, last_edited_by),
        updated_at = NOW()
      WHERE id = ${pageId} AND deleted_at IS NULL
      RETURNING *
    `

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[v0] Error updating doc page:", error)
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  try {
    const { pageId } = params

    await sql`
      UPDATE doc_pages
      SET deleted_at = NOW()
      WHERE id = ${pageId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting doc page:", error)
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 })
  }
}
