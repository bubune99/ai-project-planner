/**
 * UI Action Handler
 *
 * Processes tool call results from the AI and executes corresponding UI actions.
 * This bridges the gap between AI tool calls and actual UI changes.
 */

export type UIAction =
  | { action: "navigate_view"; view: string; reason?: string }
  | { action: "open_document_browser"; filter?: string }
  | { action: "close_document_browser" }
  | { action: "select_task"; taskId: string; scrollTo: boolean; task?: any }
  | { action: "select_document"; documentId: string; document?: any }
  | { action: "highlight_elements"; elementIds: string[]; highlightType: string; duration: number; color: string }
  | { action: "scroll_to_element"; elementId: string; position: string }
  | { action: "show_toast"; title: string; description?: string; type: string; duration: number }
  | { action: "get_context" }
  | { action: "track_focus"; focusArea: string; itemId?: string };

export interface UIActionHandlers {
  onNavigateView?: (view: string, reason?: string) => void;
  onOpenDocumentBrowser?: (filter?: string) => void;
  onCloseDocumentBrowser?: () => void;
  onSelectTask?: (taskId: string, scrollTo: boolean) => void;
  onSelectDocument?: (documentId: string) => void;
  onHighlightElements?: (elementIds: string[], type: string, duration: number, color: string) => void;
  onScrollToElement?: (elementId: string, position: string) => void;
  onShowToast?: (title: string, description?: string, type: string, duration: number) => void;
  onGetContext?: () => any;
  onTrackFocus?: (focusArea: string, itemId?: string) => void;
}

/**
 * Process a tool result and execute the corresponding UI action
 */
export function processToolResult(result: any, handlers: UIActionHandlers): void {
  if (!result || !result.action) return;

  switch (result.action) {
    case "navigate_view":
      handlers.onNavigateView?.(result.view, result.reason);
      break;

    case "open_document_browser":
      handlers.onOpenDocumentBrowser?.(result.filter);
      break;

    case "close_document_browser":
      handlers.onCloseDocumentBrowser?.();
      break;

    case "select_task":
      handlers.onSelectTask?.(result.taskId, result.scrollTo);
      break;

    case "select_document":
      handlers.onSelectDocument?.(result.documentId);
      break;

    case "highlight_elements":
      handlers.onHighlightElements?.(
        result.elementIds,
        result.highlightType,
        result.duration,
        result.color
      );
      break;

    case "scroll_to_element":
      handlers.onScrollToElement?.(result.elementId, result.position);
      break;

    case "show_toast":
      handlers.onShowToast?.(result.title, result.description, result.type, result.duration);
      break;

    case "get_context":
      return handlers.onGetContext?.();

    case "track_focus":
      handlers.onTrackFocus?.(result.focusArea, result.itemId);
      break;
  }
}

/**
 * Extract tool call results from a message and process them
 */
export function processMessageToolCalls(message: any, handlers: UIActionHandlers): void {
  // Handle tool invocations from AI SDK
  if (message.toolInvocations) {
    for (const invocation of message.toolInvocations) {
      if (invocation.state === "result" && invocation.result) {
        processToolResult(invocation.result, handlers);
      }
    }
  }
}

/**
 * Highlight utility - adds CSS classes for highlighting elements
 */
export function highlightElement(
  elementId: string,
  type: "pulse" | "glow" | "border" | "shake",
  duration: number,
  color: string
): void {
  const element = document.getElementById(elementId) || document.querySelector(`[data-id="${elementId}"]`);
  if (!element) return;

  const colorClasses: Record<string, string> = {
    blue: "ring-blue-500 shadow-blue-500/50",
    green: "ring-green-500 shadow-green-500/50",
    yellow: "ring-yellow-500 shadow-yellow-500/50",
    red: "ring-red-500 shadow-red-500/50",
    purple: "ring-purple-500 shadow-purple-500/50",
  };

  const animationClasses: Record<string, string> = {
    pulse: "animate-pulse",
    glow: "ring-2 shadow-lg",
    border: "ring-2",
    shake: "animate-shake",
  };

  // Add highlight classes
  element.classList.add(
    ...animationClasses[type]?.split(" ") || [],
    ...colorClasses[color]?.split(" ") || []
  );

  // Remove after duration
  setTimeout(() => {
    element.classList.remove(
      ...animationClasses[type]?.split(" ") || [],
      ...colorClasses[color]?.split(" ") || []
    );
  }, duration);
}

/**
 * Scroll to element utility
 */
export function scrollToElement(
  elementId: string,
  position: "start" | "center" | "end" = "center"
): void {
  const element = document.getElementById(elementId) || document.querySelector(`[data-id="${elementId}"]`);
  if (!element) return;

  element.scrollIntoView({
    behavior: "smooth",
    block: position,
  });
}
