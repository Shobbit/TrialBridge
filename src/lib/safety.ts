/**
 * Language guards applied to text supplied by the visiting WebMCP agent.
 *
 * The agent is the interpretive layer in this design — it reads a verbatim
 * criterion, asks the person a question, and supplies a cautious comparison.
 * TrialBridge stores and displays that comparison, which means TrialBridge is
 * also responsible for refusing to display text that oversteps the product
 * boundary.
 *
 * These checks are deliberately narrow and pattern-based. They are a backstop
 * against the obvious failure modes, not a general-purpose content classifier,
 * and they are applied only to agent-authored prose (explanations and
 * questions) — never to the registry's own criterion text, which must always
 * be reproduced exactly as published.
 */

export interface ProhibitedMatch {
  /** Stable code so callers can explain precisely what was rejected. */
  rule: string;
  /** What the writer should do instead. */
  guidance: string;
}

interface Rule extends ProhibitedMatch {
  pattern: RegExp;
}

/**
 * Note on `eligib*`: the words "eligibility criteria" and "eligibility" are
 * legitimate and appear throughout the registry, so the rules below target
 * *assertions about a person's eligibility*, not the vocabulary itself.
 */
const RULES: Rule[] = [
  {
    rule: "ELIGIBILITY_CLAIM",
    pattern:
      /\b(?:you|they|the (?:patient|participant)|he|she)\s+(?:are|is|would be|will be|'re)\s+(?:not\s+|in)?eligible\b/i,
    guidance:
      "Do not state that anyone is eligible or ineligible. Say the criterion appears consistent, is a potential point to discuss, or remains unknown.",
  },
  {
    rule: "ELIGIBILITY_CLAIM",
    pattern: /\b(?:you|they)\s+(?:do not|don't|doesn't|does not)\s+qualify\b/i,
    guidance:
      "Do not state that anyone does or does not qualify. Only the study team can determine that.",
  },
  {
    rule: "ELIGIBILITY_CLAIM",
    pattern: /\b(?:you|they)\s+(?:qualify|meet all|fail)\b/i,
    guidance:
      "Do not state that anyone qualifies, meets all criteria, or fails. Describe the single criterion you were asked about.",
  },
  {
    rule: "ELIGIBILITY_CLAIM",
    pattern: /\b(?:confirmed|definitely|certainly)\s+(?:eligible|ineligible)\b/i,
    guidance: "Eligibility is never confirmed here; it is determined by the study team at screening.",
  },
  {
    rule: "ELIGIBILITY_CLAIM",
    pattern: /\b(?:is|are)\s+(?:excluded|disqualified)\s+from\b/i,
    guidance:
      "Do not declare exclusion. Describe it as a potential point to discuss with the study team.",
  },
  {
    rule: "AGGREGATE_SCORE",
    // No trailing \b: "%" is not a word character, so \b would never match
    // after it and "90% match" would slip through.
    pattern: /\d{1,3}\s*(?:%|\bpercent\b)/i,
    guidance: "Do not express fit as a percentage.",
  },
  {
    rule: "AGGREGATE_SCORE",
    pattern: /\b\d{1,3}\s*(?:of|out of|\/)\s*\d{1,3}\s+criteri/i,
    guidance: "Do not summarise as an X-of-Y count of criteria.",
  },
  {
    rule: "AGGREGATE_SCORE",
    pattern: /\b(?:match|fit|eligibility|suitability)\s+(?:score|rating|rank)\b/i,
    guidance: "Do not produce a score, rating or ranking.",
  },
  {
    rule: "TREATMENT_ADVICE",
    pattern:
      /\b(?:you|they)\s+should\s+(?:stop|start|switch|change|discontinue|reduce|increase|take)\b/i,
    guidance:
      "Do not give treatment advice. Suggest raising the point with the study team or their own doctor.",
  },
  {
    rule: "TREATMENT_ADVICE",
    pattern: /\b(?:stop|discontinue|come off)\s+(?:your|their|the)\s+(?:medication|treatment|therapy|drug)\b/i,
    guidance: "Never suggest stopping or changing a treatment.",
  },
  {
    rule: "TREATMENT_ADVICE",
    pattern: /\b(?:i|we)\s+recommend\b/i,
    guidance: "Do not make recommendations. Report the comparison and let the study team advise.",
  },
  {
    rule: "DISCOURAGES_CONTACT",
    pattern:
      /\b(?:do not|don't|no (?:point|need|reason) (?:in )?)\s*(?:bother\s+)?(?:contact|contacting|applying|apply|enrol|enroll)\b/i,
    guidance:
      "Never discourage someone from contacting a study team. They decide who is screened, not this page.",
  },
  {
    rule: "DISCOURAGES_CONTACT",
    pattern: /\b(?:not worth|waste of time)\b/i,
    guidance: "Never imply that pursuing a study is not worthwhile.",
  },
  {
    rule: "DIAGNOSIS",
    pattern: /\b(?:you|they)\s+(?:have|has)\s+(?:been\s+diagnosed\s+with|a diagnosis of)\b/i,
    guidance:
      "Do not assert a diagnosis. Refer only to what the person told you, attributed as their own statement.",
  },
];

/**
 * Checks agent-authored prose for language outside the product boundary.
 *
 * @returns every rule the text violates; empty when the text is acceptable.
 */
export function findProhibitedLanguage(text: string): ProhibitedMatch[] {
  if (!text) return [];
  const seen = new Set<string>();
  const matches: ProhibitedMatch[] = [];

  for (const { pattern, rule, guidance } of RULES) {
    if (!pattern.test(text)) continue;
    const key = `${rule}:${guidance}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ rule, guidance });
  }
  return matches;
}

/** The standard label shown beside every agent-supplied comparison. */
export const AGENT_COMPARISON_LABEL = "Agent-assisted preliminary comparison";

/** Shown adjacent to any pre-screening assessment. */
export const PRESCREENING_DISCLAIMER =
  "This is a preliminary comparison prepared with an AI agent from information you supplied. It is not medical advice and it does not determine eligibility. Only the study team can decide who may take part, after medical screening. Use fictional information only while TrialBridge is in beta.";
