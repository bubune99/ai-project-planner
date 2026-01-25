import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { RelationshipsService } from "@/lib/services/relationships"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q") || ""
    const excludeId = searchParams.get("exclude") || ""

    if (!query.trim()) {
      return NextResponse.json({
        success: true,
        data: [],
      })
    }

    const results = await RelationshipsService.searchIdeas(auth.userId, excludeId, query)

    return NextResponse.json({
      success: true,
      data: results,
    })
  } catch (error) {
    console.error("Error searching ideas:", error)
    return NextResponse.json(
      { success: false, error: "Failed to search ideas" },
      { status: 500 }
    )
  }
}
