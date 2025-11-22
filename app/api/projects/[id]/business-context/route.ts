import { sql } from "@/lib/db/client"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await sql`
      SELECT * FROM business_context WHERE project_id = ${params.id}
    `

    return NextResponse.json({
      businessContext: result[0] || null,
    })
  } catch (error: any) {
    console.error("Get business context error:", error)
    return NextResponse.json({ error: "Failed to get business context", details: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const {
      vision,
      target_market,
      primary_use_case,
      revenue_model,
      competitive_advantage,
      success_metrics,
      market_analysis,
      risk_assessment,
      stakeholders,
      budget_info,
    } = body

    // Check if business context exists
    const existing = await sql`
      SELECT id FROM business_context WHERE project_id = ${params.id}
    `

    let result
    if (existing.length > 0) {
      // Update existing
      result = await sql`
        UPDATE business_context SET
          vision = ${vision},
          target_market = ${target_market},
          primary_use_case = ${primary_use_case},
          revenue_model = ${revenue_model},
          competitive_advantage = ${competitive_advantage},
          success_metrics = ${JSON.stringify(success_metrics || [])},
          market_analysis = ${JSON.stringify(market_analysis || {})},
          risk_assessment = ${JSON.stringify(risk_assessment || [])},
          stakeholders = ${JSON.stringify(stakeholders || [])},
          budget_info = ${JSON.stringify(budget_info || {})},
          updated_at = NOW()
        WHERE project_id = ${params.id}
        RETURNING *
      `
    } else {
      // Create new
      result = await sql`
        INSERT INTO business_context (
          project_id,
          vision,
          target_market,
          primary_use_case,
          revenue_model,
          competitive_advantage,
          success_metrics,
          market_analysis,
          risk_assessment,
          stakeholders,
          budget_info
        ) VALUES (
          ${params.id},
          ${vision},
          ${target_market},
          ${primary_use_case},
          ${revenue_model},
          ${competitive_advantage},
          ${JSON.stringify(success_metrics || [])},
          ${JSON.stringify(market_analysis || {})},
          ${JSON.stringify(risk_assessment || [])},
          ${JSON.stringify(stakeholders || [])},
          ${JSON.stringify(budget_info || {})}
        )
        RETURNING *
      `
    }

    return NextResponse.json({
      success: true,
      businessContext: result[0],
    })
  } catch (error: any) {
    console.error("Save business context error:", error)
    return NextResponse.json({ error: "Failed to save business context", details: error.message }, { status: 500 })
  }
}
