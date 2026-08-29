"use client";

import { useState } from "react";
import { useTrialStore } from "@/lib/store";
import { Badge, Button, EmptyState, Panel } from "./primitives";

/**
 * Questions to take to a trial investigator or the person's own doctor.
 *
 * This is where an agent's "I could not determine X" becomes something
 * actionable. Agent-written questions are labelled, and the person can add
 * their own or remove any of them.
 */
export function QuestionsPanel() {
  const questions = useTrialStore((s) => s.questions);
  const addQuestion = useTrialStore((s) => s.addQuestion);
  const removeQuestion = useTrialStore((s) => s.removeQuestion);
  const [draft, setDraft] = useState("");

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length < 5) return;
    addQuestion({ question: value, nctId: null, rationale: null, source: "human" });
    setDraft("");
  }

  function copyAll() {
    const text = questions
      .map((q, i) => `${i + 1}. ${q.question}${q.nctId ? ` (${q.nctId})` : ""}`)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  }

  return (
    <Panel
      id="questions"
      title="Questions for the study team"
      description="Take these to the trial investigator or your own doctor. Saved in this browser only."
      action={
        <div className="flex items-center gap-2">
          <Badge tone={questions.length ? "accent" : "neutral"}>{questions.length}</Badge>
          <Button type="button" onClick={copyAll} disabled={!questions.length}>
            Copy all
          </Button>
        </div>
      }
    >
      <form onSubmit={handleAdd} className="mb-3 flex gap-2">
        <label className="sr-only" htmlFor="question-draft">
          Add your own question
        </label>
        <input
          id="question-draft"
          className="w-full rounded-lg border border-tb-border bg-tb-surface px-3 py-2 text-sm placeholder:text-tb-muted/70"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a question of your own"
        />
        <Button type="submit" disabled={draft.trim().length < 5}>
          Add
        </Button>
      </form>

      {questions.length === 0 ? (
        <EmptyState title="No questions yet">
          Ask a connected agent to turn whatever it could not determine into questions you can put
          to the research team, or write your own above.
        </EmptyState>
      ) : (
        <ol className="space-y-2">
          {questions.map((q) => (
            <li
              key={q.id}
              className="rounded-lg border border-tb-border bg-tb-surface-2 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-relaxed">{q.question}</p>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.id)}
                  className="shrink-0 rounded px-1 text-tb-muted hover:text-tb-mismatch"
                  aria-label="Remove this question"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {q.nctId ? <Badge>{q.nctId}</Badge> : <Badge>General</Badge>}
                {q.source === "agent" ? <Badge tone="agent">Suggested by agent</Badge> : null}
              </div>
              {q.rationale ? (
                <p className="mt-1.5 text-[11px] text-tb-muted">Why: {q.rationale}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
