import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";

/** Shape of a registered tool definition, narrowed to what the tests touch. */
export interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: Execute;
}

export interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolOutput {
  content: ToolContent[];
  details: Record<string, unknown>;
}

export type Execute = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onUpdate: ((update: unknown) => void) | undefined,
) => Promise<ToolOutput>;

/** Stands in for pi: captures whatever the extension registers. */
export function captureApi(): { api: ExtensionAPI; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const api = {
    registerTool: (definition: unknown) => {
      const tool = definition as RegisteredTool;
      tools.set(tool.name, tool);
    },
    registerCommand: () => undefined,
  } as unknown as ExtensionAPI;
  return { api, tools };
}

export function tool(tools: Map<string, RegisteredTool>, name: string): RegisteredTool {
  const found = tools.get(name);
  if (found === undefined) throw new Error(`tool ${name} was not registered`);
  return found;
}

/** Numeric constraint of a schema property, if the schema declares one. */
export function numberConstraint(
  parameters: Record<string, unknown>,
  property: string,
  constraint: "default" | "minimum" | "maximum",
): number | undefined {
  const properties = parameters["properties"] as
    Record<string, Record<string, unknown>> | undefined;
  const value = properties?.[property]?.[constraint];
  return typeof value === "number" ? value : undefined;
}

export function acceptsParams(
  parameters: Record<string, unknown>,
  params: Record<string, unknown>,
): boolean {
  return Value.Check(parameters as never, params);
}

/** First text block of a tool result. */
export function textOf(output: ToolOutput): string {
  const block = output.content.find((item) => item.type === "text");
  return block?.text ?? "";
}

export const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
