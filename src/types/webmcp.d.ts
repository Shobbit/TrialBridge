/**
 * Minimal ambient typings for the WebMCP / Site Tools imperative browser API.
 *
 * Spec subset implemented by ChatGPT's browser agent:
 *   https://learn.chatgpt.com/docs/webmcp
 *
 * These are declared locally (rather than imported) because no stable package
 * ships them yet, and because the API must be feature-detected at runtime.
 */

/** JSON Schema (draft 2020-12 subset) accepted by `registerTool`. */
export interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

/** MCP tool behaviour hints. Purely advisory, but agents use them to decide
 *  whether a call needs user confirmation. */
export interface ToolAnnotations {
  /** Tool does not modify application state. */
  readOnlyHint?: boolean;
  /** Tool may remove or overwrite data the user cares about. */
  destructiveHint?: boolean;
  /** Repeated identical calls leave state unchanged after the first. */
  idempotentHint?: boolean;
  /** Tool reaches beyond the page (e.g. a network call to a third party). */
  openWorldHint?: boolean;
  /** Human-readable label shown in agent UIs. */
  title?: string;
}

/** MCP content block. We only ever emit `text`. */
export interface ToolContentBlock {
  type: "text";
  text: string;
}

/**
 * Result returned from a tool handler. We always return both a `content`
 * array (readable by any MCP client) and `structuredContent` (machine
 * readable), so the tool works regardless of which shape the host prefers.
 */
export interface ToolResult<T = unknown> {
  content: ToolContentBlock[];
  structuredContent?: T;
  isError?: boolean;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  annotations?: ToolAnnotations;
  execute: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

export interface ModelContext {
  registerTool: (tool: ToolDescriptor) => Promise<unknown> | unknown;
  /** Present in some builds; used for best-effort cleanup. */
  unregisterTool?: (name: string) => Promise<unknown> | unknown;
  provideContext?: (ctx: { tools: ToolDescriptor[] }) => Promise<unknown> | unknown;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
