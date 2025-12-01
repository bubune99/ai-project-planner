import {
    Project,
    ProjectStep,
    Agent,
    ProjectPhase,
    ArchitectureDecision,
    Document
} from '@/lib/types'
import { ApiResponse } from '@/lib/api-utils'

/**
 * AI Project Planner SDK
 * The "COM Object" for external agents to interact with the Headless CMS.
 */
export class AIProjectPlannerClient {
    private baseUrl: string
    private apiKey?: string

    constructor(config: { baseUrl: string; apiKey?: string }) {
        this.baseUrl = config.baseUrl
        this.apiKey = config.apiKey
    }

    private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${path}`
        const headers = {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                ...headers,
                ...options?.headers
            }
        })

        const result: ApiResponse<T> = await response.json()

        if (!result.success) {
            throw new Error(result.error?.message || 'Unknown API error')
        }

        return result.data as T
    }

    /**
     * Knowledge Base: The "Long-Term Memory"
     */
    public knowledgeBase = {
        /**
         * Get a specific document by category and slug (or title search for now)
         */
        get: async (category: string, query: string): Promise<Document[]> => {
            return this.fetch<Document[]>(`/api/knowledge-base?category=${category}&query=${query}`)
        },

        /**
         * Search the knowledge base
         */
        search: async (query: string): Promise<Document[]> => {
            return this.fetch<Document[]>(`/api/knowledge-base?query=${query}`)
        },

        /**
         * Create a document
         */
        create: async (doc: Partial<Document> & { content?: string }): Promise<Document> => {
            return this.fetch<Document>('/api/knowledge-base', {
                method: 'POST',
                body: JSON.stringify(doc)
            })
        }
    }

    /**
     * Projects: The "State"
     */
    public projects = {
        list: async (status?: string): Promise<Project[]> => {
            const query = status ? `?status=${status}` : ''
            return this.fetch<Project[]>(`/api/projects${query}`)
        },
        get: async (id: string): Promise<Project> => {
            // Note: Current API doesn't have a single project GET yet, using list with filter or adding endpoint later
            // For now, let's assume we might need to add /api/projects/[id]
            // But based on the plan, I only implemented /api/projects (list/create)
            // I should probably add /api/projects/[id] if I want this to work fully.
            // For MVP, I'll leave this as a placeholder or implement it if needed.
            // Actually, I'll implement it as a list filter for now if the API supports it, or throw.
            throw new Error('Get single project not implemented in API yet')
        },
        create: async (data: Partial<Project>): Promise<Project> => {
            return this.fetch<Project>('/api/projects', {
                method: 'POST',
                body: JSON.stringify(data)
            })
        }
    }

    /**
     * Phases: Lifecycle Management
     */
    public phases = {
        list: async (projectId: string): Promise<ProjectPhase[]> => {
            return this.fetch<ProjectPhase[]>(`/api/projects/${projectId}/phases`)
        },
        transition: async (projectId: string, newPhase: string, completedBy: string, description?: string): Promise<any> => {
            return this.fetch(`/api/projects/${projectId}/phases`, {
                method: 'POST',
                body: JSON.stringify({ newPhase, completedBy, description })
            })
        }
    }

    /**
     * Agents: The "Workforce"
     */
    public agents = {
        list: async (): Promise<Agent[]> => {
            return this.fetch<Agent[]>('/api/agents')
        },
        updateStatus: async (name: string, status: string, currentTaskId?: string): Promise<Agent> => {
            return this.fetch<Agent>('/api/agents', {
                method: 'PATCH',
                body: JSON.stringify({ name, status, currentTaskId })
            })
        }
    }

    /**
     * Vibecoding: The "Protocol"
     */
    public vibecoding = {
        getPrompt: async (type: string, context: Record<string, any>): Promise<string> => {
            // This would likely fetch from a specific 'prompts' category in Knowledge Base
            const docs = await this.knowledgeBase.get('prompts', type)
            if (docs.length > 0) {
                // Assume content is in metadata or description for now
                return docs[0].metadata?.content || docs[0].description || ''
            }
            throw new Error(`Prompt for ${type} not found`)
        }
    }

    /**
     * Design & Visuals: The "Eye" (Future)
     */
    public design = {
        getSitemap: async (): Promise<any> => {
            throw new Error('Not implemented')
        },
        integrations: {
            figma: {
                sync: async (fileId: string): Promise<void> => { throw new Error('Not implemented') }
            },
            canvas: {
                get: async (id: string): Promise<any> => { throw new Error('Not implemented') }
            }
        }
    }
}
