import { sql, pool } from "@/lib/db/client"

export type RelationshipType =
  | "depends-on"
  | "enables"
  | "similar-to"
  | "conflicts-with"
  | "merged-into"
  | "spawned-from"
  | "evolved-into"

export interface IdeaRelationship {
  id: string
  from_idea_id: string
  to_idea_id: string
  relationship_type: RelationshipType
  metadata: Record<string, any> | null
  created_at: string
}

export interface CreateRelationshipInput {
  to_idea_id: string
  relationship_type: RelationshipType
  metadata?: Record<string, any>
}

export interface SearchIdeasResult {
  id: string
  title: string
  lifecycle: string
  description: string | null
  created_at: string
  updated_at: string
}

/**
 * Service for managing idea relationships
 */
export class RelationshipsService {
  /**
   * List all relationships for an idea (both from and to)
   */
  static async list(ideaId: string): Promise<IdeaRelationship[]> {
    const result = await sql`
      SELECT * FROM idea_relationships
      WHERE from_idea_id = ${ideaId} OR to_idea_id = ${ideaId}
      ORDER BY created_at DESC
    `
    return result as IdeaRelationship[]
  }

  /**
   * Create a new relationship
   */
  static async create(fromIdeaId: string, input: CreateRelationshipInput): Promise<IdeaRelationship> {
    const { to_idea_id, relationship_type, metadata } = input

    const result = await sql`
      INSERT INTO idea_relationships
      (from_idea_id, to_idea_id, relationship_type, metadata)
      VALUES (${fromIdeaId}, ${to_idea_id}, ${relationship_type}, ${metadata ? JSON.stringify(metadata) : null})
      RETURNING *
    `

    return result[0] as IdeaRelationship
  }

  /**
   * Delete a relationship
   */
  static async delete(relationshipId: string): Promise<boolean> {
    const result = await sql`
      DELETE FROM idea_relationships WHERE id = ${relationshipId} RETURNING id
    `
    return result.length > 0
  }

  /**
   * Search for ideas to relate to (excludes the current idea)
   */
  static async searchIdeas(userId: string, excludeIdeaId: string, searchQuery: string): Promise<SearchIdeasResult[]> {
    const pattern = `%${searchQuery}%`
    const result = await sql`
      SELECT id, title, lifecycle, description, created_at, updated_at
      FROM ideas
      WHERE user_id = ${userId} AND id != ${excludeIdeaId}
        AND (title ILIKE ${pattern} OR description ILIKE ${pattern})
      ORDER BY updated_at DESC
      LIMIT 20
    `
    return result as SearchIdeasResult[]
  }

  /**
   * Spawn a child idea from a parent
   * Creates a new idea with relationship and optionally inherits data
   */
  static async spawnChild(
    userId: string,
    parentIdeaId: string,
    childTitle: string,
    childDescription: string,
    inheritOptions: {
      facets?: boolean
      perspectives?: boolean
      nodes?: boolean
      relationships?: boolean
    }
  ): Promise<{ childIdea: any; relationship: IdeaRelationship }> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Create the child idea
      const childResult = await client.query(
        `INSERT INTO ideas (user_id, title, description, lifecycle)
         VALUES ($1, $2, $3, 'seed')
         RETURNING *`,
        [userId, childTitle, childDescription]
      )
      const childIdea = childResult.rows[0]

      // Create default branch for child
      const branchResult = await client.query(
        `INSERT INTO idea_branches (idea_id, name, is_main, is_active)
         VALUES ($1, 'Main', true, true)
         RETURNING id`,
        [childIdea.id]
      )
      const branchId = branchResult.rows[0].id

      // Inherit facets if requested
      if (inheritOptions.facets) {
        await client.query(
          `INSERT INTO idea_facets (idea_id, branch_id, facet_type, name, data)
           SELECT $2, $3, facet_type, name, data
           FROM idea_facets
           WHERE idea_id = $1`,
          [parentIdeaId, childIdea.id, branchId]
        )
      }

      // Create spawned-from relationship
      const relationshipResult = await client.query(
        `INSERT INTO idea_relationships
         (from_idea_id, to_idea_id, relationship_type, metadata)
         VALUES ($1, $2, 'spawned-from', $3)
         RETURNING *`,
        [childIdea.id, parentIdeaId, JSON.stringify({ inherit_options: inheritOptions })]
      )

      await client.query("COMMIT")

      return {
        childIdea,
        relationship: relationshipResult.rows[0] as IdeaRelationship,
      }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Mark an idea as evolved into another
   */
  static async markEvolvedInto(fromIdeaId: string, toIdeaId: string, notes?: string): Promise<IdeaRelationship> {
    const result = await sql`
      INSERT INTO idea_relationships
      (from_idea_id, to_idea_id, relationship_type, metadata)
      VALUES (${fromIdeaId}, ${toIdeaId}, 'evolved-into', ${notes ? JSON.stringify({ notes }) : null})
      RETURNING *
    `
    return result[0] as IdeaRelationship
  }

  /**
   * Merge two ideas - creates relationship and optionally archives source
   */
  static async mergeIdeas(
    sourceIdeaId: string,
    targetIdeaId: string,
    strategy: "keep-both" | "primary" | "secondary",
    archiveSource: boolean = true
  ): Promise<{ relationship: IdeaRelationship; sourceArchived: boolean }> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Create merged-into relationship
      const relationshipResult = await client.query(
        `INSERT INTO idea_relationships
         (from_idea_id, to_idea_id, relationship_type, metadata)
         VALUES ($1, $2, 'merged-into', $3)
         RETURNING *`,
        [sourceIdeaId, targetIdeaId, JSON.stringify({ strategy })]
      )

      // If keep-both strategy, copy facets from source to target
      if (strategy === "keep-both") {
        // Get target's default branch
        const branchResult = await client.query(
          `SELECT id FROM idea_branches WHERE idea_id = $1 AND is_active = true LIMIT 1`,
          [targetIdeaId]
        )
        const targetBranchId = branchResult.rows[0]?.id

        if (targetBranchId) {
          await client.query(
            `INSERT INTO idea_facets (idea_id, facet_type, name, data, branch_id)
             SELECT $2, facet_type, '[Merged] ' || COALESCE(name, facet_type), data, $3
             FROM idea_facets
             WHERE idea_id = $1`,
            [sourceIdeaId, targetIdeaId, targetBranchId]
          )
        }
      }

      // Archive source idea if requested
      let sourceArchived = false
      if (archiveSource) {
        await client.query(
          `UPDATE ideas
           SET lifecycle = 'archived',
               deleted_at = NOW()
           WHERE id = $1`,
          [sourceIdeaId]
        )
        sourceArchived = true
      }

      await client.query("COMMIT")

      return {
        relationship: relationshipResult.rows[0] as IdeaRelationship,
        sourceArchived,
      }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}
