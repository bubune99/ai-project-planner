/** Leads in the database. Callers check access first (app/api/projects/[id]/leads). Rules: lead-model.ts. */
import { sql } from "@/lib/db/client"
import type { LeadInput, LeadStatus } from "./lead-model"

export interface Lead {
  id: string; source: string; ref: string | null; name: string; email: string; company: string | null
  topic: string | null; message: string; status: LeadStatus; createdAt: string; updatedAt: string
}

const toLead = (r: Record<string, unknown>): Lead => ({
  id: String(r.id), source: String(r.source), ref: (r.ref as string | null) ?? null, name: String(r.name), email: String(r.email),
  company: (r.company as string | null) ?? null, topic: (r.topic as string | null) ?? null, message: String(r.message),
  status: r.status as LeadStatus, createdAt: new Date(r.created_at as string).toISOString(), updatedAt: new Date(r.updated_at as string).toISOString(),
})

/** Saves a note; a second send with the same ref returns the first one (created: false). */
export async function saveLead(projectId: string, userId: string, lead: LeadInput): Promise<{ lead: Lead; created: boolean }> {
  const rows = (await sql`
    INSERT INTO leads (project_id, source, ref, name, email, company, topic, message, created_by)
    VALUES (${projectId}, ${lead.source}, ${lead.ref}, ${lead.name}, ${lead.email}, ${lead.company}, ${lead.topic}, ${lead.message}, ${userId})
    ON CONFLICT (project_id, ref) WHERE ref IS NOT NULL DO NOTHING
    RETURNING *
  `) as Record<string, unknown>[]
  if (rows.length) return { lead: toLead(rows[0]), created: true }
  const [old] = (await sql`SELECT * FROM leads WHERE project_id = ${projectId} AND ref = ${lead.ref}`) as Record<string, unknown>[]
  return { lead: toLead(old), created: false }
}

export async function listLeads(projectId: string, limit = 200): Promise<Lead[]> {
  const rows = (await sql`SELECT * FROM leads WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[]
  return rows.map(toLead)
}

export async function setLeadStatus(projectId: string, id: string, status: LeadStatus): Promise<Lead | null> {
  const rows = (await sql`UPDATE leads SET status = ${status}, updated_at = now() WHERE id = ${id} AND project_id = ${projectId} RETURNING *`) as Record<string, unknown>[]
  return rows.length ? toLead(rows[0]) : null
}
