/**
 * Server error reports (Next 15 onRequestError): each uncaught error in a route, page or server action becomes one
 * line in Vercel's logs, with its route and kind and nothing private. See lib/observability/request-error.ts.
 */
import { errorLine, type RequestInfo, type RouteContext } from "@/lib/observability/request-error"

export function register() {}

export async function onRequestError(err: unknown, request: RequestInfo, context: RouteContext) {
  console.error(errorLine(err, request, context))
}
