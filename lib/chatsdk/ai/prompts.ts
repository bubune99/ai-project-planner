/**
 * AI prompts for chatsdk artifacts
 * These are placeholder prompts that can be customized
 */

export const codePrompt = `You are a helpful code assistant. Generate code based on the user's request.
Return your response as a JSON object with a "code" field containing the code.`;

export const textPrompt = `You are a helpful writing assistant. Generate text based on the user's request.
Return your response as a JSON object with a "text" field containing the text.`;

export const sheetPrompt = `You are a helpful data assistant. Generate spreadsheet data based on the user's request.
Return your response as a JSON object with a "csv" field containing the CSV data.`;

export function updateDocumentPrompt(
  currentContent: string | null | undefined,
  kind: "code" | "text" | "sheet"
): string {
  return `You are helping to update an existing ${kind} document.
Current content:
\`\`\`
${currentContent}
\`\`\`

Make the requested changes while preserving the overall structure.
Return your response as a JSON object with a "${kind === "sheet" ? "csv" : kind}" field.`;
}
