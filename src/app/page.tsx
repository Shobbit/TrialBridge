import { TrialBridgeApp } from "@/components/TrialBridgeApp";

/**
 * Top-level page.
 *
 * WebMCP tools are registered by `TrialBridgeApp`, which is a client component
 * rendered directly here — not inside an iframe — because the Site Tools API
 * only discovers tools registered by the top-level document.
 */
export default function Home() {
  return <TrialBridgeApp />;
}
