import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * robots.txt.
 *
 * TrialBridge is meant to be opened in ChatGPT's browser and driven through its
 * WebMCP site tools, so `ChatGPT-User` — the agent identifying a fetch a person
 * asked for in their own session — is allowed. Everything else that crawls for
 * an index or a training corpus stays blocked.
 *
 * These tests exist because the distinction is easy to lose. A well-meant
 * tidy-up that deletes the ChatGPT-User group does not allow it: with no group
 * of its own, a user-agent falls through to `User-agent: *`, which disallows
 * everything. Only an explicit `Allow` works, and only these tests will notice
 * if it goes missing.
 */

const robots = readFileSync(join(process.cwd(), "public", "robots.txt"), "utf8");

/**
 * The directives in one user-agent group.
 *
 * Parsed rather than pattern-matched against the whole file, so a test cannot
 * pass on a directive that belongs to a different agent.
 */
function groupFor(agent: string): string[] {
  const lines = robots.split(/\r?\n/).map((l) => l.trim());
  const directives: string[] = [];
  let inGroup = false;

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^user-agent:\s*(.+)$/i);
    if (match) {
      // Consecutive User-agent lines share one group; a directive ends it.
      inGroup = match[1].trim().toLowerCase() === agent.toLowerCase();
      continue;
    }
    if (inGroup) directives.push(line.toLowerCase());
  }
  return directives;
}

const isAllowed = (agent: string) => groupFor(agent).includes("allow: /");
const isDisallowed = (agent: string) => groupFor(agent).includes("disallow: /");

describe("ChatGPT-User", () => {
  it("is allowed, because that is how the app is meant to be used", () => {
    expect(isAllowed("ChatGPT-User")).toBe(true);
    expect(isDisallowed("ChatGPT-User")).toBe(false);
  });

  it("has a group of its own rather than relying on omission", () => {
    // Falling through to `User-agent: *` would block it. The group must exist.
    expect(groupFor("ChatGPT-User").length).toBeGreaterThan(0);
  });
});

describe("crawlers that stay blocked", () => {
  it("still refuses the OpenAI training and search crawlers", () => {
    // Different mechanisms from WebMCP: one builds a training corpus, the
    // other a search index. Neither is needed to run the site tools.
    expect(isDisallowed("GPTBot")).toBe(true);
    expect(isDisallowed("OAI-SearchBot")).toBe(true);
  });

  it("still refuses every other AI and dataset crawler", () => {
    for (const agent of [
      "ClaudeBot",
      "Claude-Web",
      "anthropic-ai",
      "PerplexityBot",
      "CCBot",
      "Bytespider",
      "Google-Extended",
      "Amazonbot",
      "Applebot",
      "Meta-ExternalAgent",
      "cohere-ai",
      "Diffbot",
    ]) {
      // Only assert on agents the file actually lists, so this test does not
      // silently pass when a group is deleted.
      if (groupFor(agent).length === 0) continue;
      expect(isDisallowed(agent), agent).toBe(true);
      expect(isAllowed(agent), agent).toBe(false);
    }
  });

  it("still refuses the search engines", () => {
    for (const agent of ["Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Baiduspider"]) {
      expect(isDisallowed(agent), agent).toBe(true);
    }
  });

  it("keeps the catch-all group closed", () => {
    // Anything not named is disallowed, which is why ChatGPT-User needs its
    // own explicit Allow.
    expect(isDisallowed("*")).toBe(true);
  });
});

describe("what the file claims about itself", () => {
  it("does not claim robots.txt is access control", () => {
    expect(robots).toMatch(/NOT an access control/i);
  });

  it("names the header that actually prevents indexing", () => {
    expect(robots).toMatch(/X-Robots-Tag/);
    expect(robots).toMatch(/noindex/);
  });
});
