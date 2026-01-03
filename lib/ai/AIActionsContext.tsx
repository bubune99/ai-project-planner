"use client";

/**
 * AI Actions Context Provider
 *
 * Provides a context for AI-controlled UI actions throughout the application.
 * Components can subscribe to actions and respond to AI commands.
 */

import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { highlightElement, scrollToElement as scrollToEl } from "./ui-actions";

export interface AIActionsContextValue {
  // Navigation
  navigateToView: (view: string, reason?: string) => void;

  // Document Browser
  openDocumentBrowser: (filter?: string) => void;
  closeDocumentBrowser: () => void;

  // Selection
  selectTask: (taskId: string, scrollTo?: boolean) => void;
  selectDocument: (documentId: string) => void;

  // Visual Feedback
  highlightElements: (
    elementIds: string[],
    type?: "pulse" | "glow" | "border" | "shake",
    duration?: number,
    color?: "blue" | "green" | "yellow" | "red" | "purple"
  ) => void;
  scrollToElement: (elementId: string, position?: "start" | "center" | "end") => void;
  showToast: (title: string, description?: string, type?: "default" | "success" | "error" | "warning" | "info", duration?: number) => void;

  // Context
  getCurrentContext: () => AIContext;
  setActiveTab: (tab: string) => void;
  setSelectedTask: (task: any) => void;
  setSelectedDocument: (doc: any) => void;
  setProjectId: (id: string) => void;

  // Telemetry
  trackFocus: (focusArea: string, itemId?: string) => void;

  // State
  context: AIContext;
}

export interface AIContext {
  activeTab: string;
  selectedTask: any;
  selectedDocument: any;
  projectId: string | null;
  lastInteraction: {
    type: string;
    timestamp: Date;
    itemId?: string;
  } | null;
}

const AIActionsContext = createContext<AIActionsContextValue | null>(null);

interface AIActionsProviderProps {
  children: React.ReactNode;
  // External handlers from parent component
  onNavigateView?: (view: string) => void;
  onOpenDocumentBrowser?: (filter?: string) => void;
  onCloseDocumentBrowser?: () => void;
  onSelectTask?: (task: any) => void;
  onSelectDocument?: (doc: any) => void;
  onShowToast?: (props: { title: string; description?: string; variant?: string }) => void;
  initialContext?: Partial<AIContext>;
}

export function AIActionsProvider({
  children,
  onNavigateView,
  onOpenDocumentBrowser,
  onCloseDocumentBrowser,
  onSelectTask,
  onSelectDocument,
  onShowToast,
  initialContext = {},
}: AIActionsProviderProps) {
  const [context, setContext] = useState<AIContext>({
    activeTab: initialContext.activeTab || "dashboard",
    selectedTask: initialContext.selectedTask || null,
    selectedDocument: initialContext.selectedDocument || null,
    projectId: initialContext.projectId || null,
    lastInteraction: null,
  });

  // Store task/document data by ID for selection
  const taskCacheRef = useRef<Map<string, any>>(new Map());
  const documentCacheRef = useRef<Map<string, any>>(new Map());

  const navigateToView = useCallback((view: string, reason?: string) => {
    console.log(`[AI Action] Navigate to ${view}${reason ? `: ${reason}` : ""}`);
    setContext((prev) => ({ ...prev, activeTab: view }));
    onNavigateView?.(view);
  }, [onNavigateView]);

  const openDocumentBrowser = useCallback((filter?: string) => {
    console.log(`[AI Action] Open document browser${filter ? ` with filter: ${filter}` : ""}`);
    onOpenDocumentBrowser?.(filter);
  }, [onOpenDocumentBrowser]);

  const closeDocumentBrowser = useCallback(() => {
    console.log("[AI Action] Close document browser");
    onCloseDocumentBrowser?.();
  }, [onCloseDocumentBrowser]);

  const selectTask = useCallback((taskId: string, scrollTo = true) => {
    console.log(`[AI Action] Select task: ${taskId}`);
    // Try to get from cache or fetch
    const cachedTask = taskCacheRef.current.get(taskId);
    if (cachedTask) {
      setContext((prev) => ({ ...prev, selectedTask: cachedTask }));
      onSelectTask?.(cachedTask);
    } else {
      // Create minimal task reference
      const taskRef = { id: taskId };
      setContext((prev) => ({ ...prev, selectedTask: taskRef }));
      onSelectTask?.(taskRef);
    }

    if (scrollTo) {
      setTimeout(() => scrollToEl(taskId, "center"), 100);
      highlightElement(taskId, "glow", 3000, "blue");
    }
  }, [onSelectTask]);

  const selectDocument = useCallback((documentId: string) => {
    console.log(`[AI Action] Select document: ${documentId}`);
    const cachedDoc = documentCacheRef.current.get(documentId);
    if (cachedDoc) {
      setContext((prev) => ({ ...prev, selectedDocument: cachedDoc }));
      onSelectDocument?.(cachedDoc);
    } else {
      const docRef = { id: documentId };
      setContext((prev) => ({ ...prev, selectedDocument: docRef }));
      onSelectDocument?.(docRef);
    }
  }, [onSelectDocument]);

  const highlightElements = useCallback((
    elementIds: string[],
    type: "pulse" | "glow" | "border" | "shake" = "glow",
    duration = 3000,
    color: "blue" | "green" | "yellow" | "red" | "purple" = "blue"
  ) => {
    console.log(`[AI Action] Highlight ${elementIds.length} elements`);
    elementIds.forEach((id) => {
      highlightElement(id, type, duration, color);
    });
  }, []);

  const scrollToElement = useCallback((elementId: string, position: "start" | "center" | "end" = "center") => {
    console.log(`[AI Action] Scroll to: ${elementId}`);
    scrollToEl(elementId, position);
  }, []);

  const showToast = useCallback((
    title: string,
    description?: string,
    type: "default" | "success" | "error" | "warning" | "info" = "default",
    duration = 5000
  ) => {
    console.log(`[AI Action] Toast: ${title}`);
    onShowToast?.({
      title,
      description,
      variant: type === "error" ? "destructive" : "default",
    });
  }, [onShowToast]);

  const getCurrentContext = useCallback(() => {
    return context;
  }, [context]);

  const setActiveTab = useCallback((tab: string) => {
    setContext((prev) => ({ ...prev, activeTab: tab }));
  }, []);

  const setSelectedTask = useCallback((task: any) => {
    if (task?.id) {
      taskCacheRef.current.set(task.id, task);
    }
    setContext((prev) => ({ ...prev, selectedTask: task }));
  }, []);

  const setSelectedDocument = useCallback((doc: any) => {
    if (doc?.id) {
      documentCacheRef.current.set(doc.id, doc);
    }
    setContext((prev) => ({ ...prev, selectedDocument: doc }));
  }, []);

  const setProjectId = useCallback((id: string) => {
    setContext((prev) => ({ ...prev, projectId: id }));
  }, []);

  const trackFocus = useCallback((focusArea: string, itemId?: string) => {
    console.log(`[AI Telemetry] Focus: ${focusArea}${itemId ? ` - ${itemId}` : ""}`);
    setContext((prev) => ({
      ...prev,
      lastInteraction: {
        type: focusArea,
        timestamp: new Date(),
        itemId,
      },
    }));
  }, []);

  const value: AIActionsContextValue = {
    navigateToView,
    openDocumentBrowser,
    closeDocumentBrowser,
    selectTask,
    selectDocument,
    highlightElements,
    scrollToElement,
    showToast,
    getCurrentContext,
    setActiveTab,
    setSelectedTask,
    setSelectedDocument,
    setProjectId,
    trackFocus,
    context,
  };

  return (
    <AIActionsContext.Provider value={value}>
      {children}
    </AIActionsContext.Provider>
  );
}

export function useAIActions() {
  const context = useContext(AIActionsContext);
  if (!context) {
    throw new Error("useAIActions must be used within an AIActionsProvider");
  }
  return context;
}

export { AIActionsContext };
