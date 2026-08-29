"use client";

import { useEffect, useState } from "react";
import { createTools } from "./tools";
import type { ToolDescriptor } from "@/types/webmcp";

export type WebMcpStatus = "checking" | "registered" | "unavailable" | "failed";

export interface WebMcpState {
  status: WebMcpStatus;
  toolNames: string[];
  error: string | null;
}

/**
 * Registers the TrialBridge tools with the browser's WebMCP implementation.
 *
 * Registration deliberately happens here, in a client component mounted by the
 * root layout of the top-level page. Per the Site Tools documentation, tools
 * registered inside an iframe are not discoverable, so this component must
 * never be moved into an embedded document.
 */
export function useWebMcpRegistration(): WebMcpState {
  const [state, setState] = useState<WebMcpState>({
    status: "checking",
    toolNames: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const tools = createTools();

    async function register() {
      // Feature-detect rather than assuming: the ordinary site must keep
      // working in browsers with no WebMCP support at all.
      if (typeof document === "undefined" || typeof document.modelContext?.registerTool !== "function") {
        if (!cancelled) {
          setState({
            status: "unavailable",
            toolNames: tools.map((t) => t.name),
            error: null,
          });
        }
        return;
      }

      const registered: string[] = [];
      try {
        for (const tool of tools) {
          await document.modelContext!.registerTool(tool as ToolDescriptor);
          registered.push(tool.name);
        }
        if (!cancelled) {
          setState({ status: "registered", toolNames: registered, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "failed",
            toolNames: registered,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void register();

    return () => {
      cancelled = true;
      // Best-effort cleanup; unregisterTool is not present in every build.
      const unregister = document.modelContext?.unregisterTool;
      if (typeof unregister === "function") {
        for (const tool of tools) {
          try {
            void unregister.call(document.modelContext, tool.name);
          } catch {
            // Nothing useful to do if teardown fails.
          }
        }
      }
    };
  }, []);

  return state;
}
