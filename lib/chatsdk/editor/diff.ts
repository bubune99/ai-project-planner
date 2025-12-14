/**
 * Stub diff utilities for the editor
 */
import type { Schema, Node as ProsemirrorNode } from "prosemirror-model";

export interface DiffResult {
  type: "add" | "remove" | "unchanged";
  value: string;
}

export enum DiffType {
  Inserted = "inserted",
  Deleted = "deleted",
  Unchanged = "unchanged",
}

export function computeDiff(oldText: string, newText: string): DiffResult[] {
  // Simple stub implementation
  if (oldText === newText) {
    return [{ type: "unchanged", value: oldText }];
  }

  return [
    { type: "remove", value: oldText },
    { type: "add", value: newText },
  ];
}

/**
 * Stub diffEditor function for ProseMirror diff view
 * In a real implementation, this would compute a diff between two documents
 */
export function diffEditor(
  schema: Schema,
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>
): ProsemirrorNode {
  // Return the new doc as-is for now (stub implementation)
  // A real implementation would mark insertions and deletions
  return schema.nodeFromJSON(newDoc);
}
