import { NextResponse } from 'next/server'
import { detailsForCaller } from './api/error-text'

/**
 * Standard API Response Envelope
 */
export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: {
        code: string
        message: string
        details?: any
    }
    meta?: {
        page?: number
        limit?: number
        total?: number
        [key: string]: any
    }
}

/**
 * Create a success response
 */
export function successResponse<T>(
    data: T,
    meta?: ApiResponse['meta'],
    status: number = 200
): NextResponse<ApiResponse<T>> {
    return NextResponse.json(
        {
            success: true,
            data,
            meta,
        },
        { status }
    )
}

/**
 * Create an error response.
 *
 * `details` reaches the caller only for a problem with the request (below 500). On a failure of ours it is the
 * database's or a library's text, so it is logged here and left out of the answer (lib/api/error-text.ts).
 */
export function errorResponse(
    code: string,
    message: string,
    status: number = 500,
    details?: any
): NextResponse<ApiResponse> {
    const shown = detailsForCaller(status, details)
    if (details != null && shown === undefined) console.error(`[API] ${status} ${code}: ${message}`, details)
    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message,
                details: shown,
            },
        },
        { status }
    )
}

/**
 * Common Error Codes
 */
export const ErrorCodes = {
    BAD_REQUEST: 'BAD_REQUEST',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
}
