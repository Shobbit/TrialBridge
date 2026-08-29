"use client";

import { useState } from "react";
import { useTrialStore } from "@/lib/store";
import { useWebMcpRegistration } from "@/webmcp/WebMcpProvider";
import { Badge, formatTimestamp } from "./primitives";

/**
 * Shows whether the WebMCP tools registered, and echoes the most recent agent
 * action back to the person.
 *
 * When `document.modelContext` is missing the site keeps working normally and
 * this becomes the development notice required for incompatible browsers.
 */
export function AgentStatus() {
  const { status, toolNames, error } = useWebMcpRegistration();
  const lastAction = useTrialStore((s) => s.lastAgentAction);
  const lastActionAt = useTrialStore((s) => s.lastAgentActionAt);
  const [expanded, setExpanded] = useState(false);

  const tone =
    status === "registered" ? "match" : status === "failed" ? "mismatch" : "unknown";

  const label =
    status === "checking"
      ? "Checking for WebMCP support…"
      : status === "registered"
        ? `WebMCP active — ${toolNames.length} tools registered`
        : status === "failed"
          ? "WebMCP tool registration failed"
          : "WebMCP not available in this browser";

  return (
    // `key` changes on every agent write, remounting this element so the CSS
    // highlight replays. This keeps the flash out of React state entirely.
    <div
      key={lastActionAt ?? "idle"}
      className={`rounded-xl border bg-tb-surface px-4 py-3 ${lastActionAt ? "tb-flash" : ""} ${
        status === "registered" ? "border-tb-match/40" : "border-tb-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-[11px] font-medium text-tb-accent underline underline-offset-2"
        >
          {expanded ? "Hide details" : "What is this?"}
        </button>
      </div>

      {status === "unavailable" ? (
        <p className="mt-1.5 text-[11px] text-tb-muted">
          This page did not find <code className="font-mono">document.modelContext</code>. Every
          feature below still works normally by hand. WebMCP tool testing requires a browser or
          extension that implements the Site Tools API, such as ChatGPT Atlas.
        </p>
      ) : null}

      {status === "failed" ? (
        <p className="mt-1.5 text-[11px] text-tb-mismatch">
          Registration error: {error}. The site continues to work without agent tools.
        </p>
      ) : null}

      {lastAction ? (
        <p className="mt-1.5 text-[11px]">
          <span className="font-medium text-tb-agent">Last agent action:</span> {lastAction}{" "}
          <span className="text-tb-muted">({formatTimestamp(lastActionAt)})</span>
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-2 border-t border-tb-border pt-2">
          <p className="text-[11px] text-tb-muted">
            TrialBridge exposes its own functions to a browser AI agent using the WebMCP{" "}
            <code className="font-mono">document.modelContext.registerTool</code> API. An agent can
            read the form, run searches, open trial records, change the shortlist and add questions
            — and every one of those actions appears on this page immediately, where you can review
            or undo it.
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {toolNames.map((name) => (
              <li key={name}>
                <code className="rounded bg-tb-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                  {name}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
