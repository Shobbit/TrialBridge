"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_SEARCH_STATUS,
  SEARCHABLE_RECRUITMENT_STATUSES,
  type SearchMeta,
  type SearchableRecruitmentStatus,
  type Trial,
} from "./ctgov/types";
import type { Criterion } from "./criteria";
import {
  EMPTY_PROFILE,
  profileSchema,
  type PreScreeningResponse,
  type ProfileUpdate,
  type ScreeningQuestion,
  type SearchInput,
  type SearchProfile,
} from "./schemas";

/**
 * The application's single source of truth.
 *
 * This store is deliberately a vanilla Zustand store rather than React state:
 * the WebMCP tool handlers run outside the React tree and mutate it through
 * `useTrialStore.getState()`, while components subscribe to the very same
 * store. That is what makes an agent action appear on screen instantly - there
 * is no second copy of the state to keep in sync.
 *
 * Persistence is `localStorage` only. Nothing here is ever sent to a server
 * except the coarse search fields needed for one ClinicalTrials.gov query.
 */

export type RequestState = "idle" | "loading" | "success" | "error";

export interface ShortlistEntry {
  trial: Trial;
  addedAt: string;
  /** Optional short note explaining why it was shortlisted. */
  note: string | null;
  source: "agent" | "human";
}

/**
 * The single active pre-screening session.
 *
 * Deliberately one-at-a-time and scoped to one trial: this is a focused
 * conversation about one study's published criteria, not a longitudinal
 * patient record. There is no cross-trial reuse of answers — starting a
 * session for another study replaces this one.
 */
export interface PreScreeningSession {
  nctId: string;
  trialTitle: string;
  sourceUrl: string;
  /** When the criteria were read from ClinicalTrials.gov. */
  retrievedAt: string;
  criteria: Criterion[];
  /** False when the registry text could not be split; see `notice`. */
  segmented: boolean;
  notice: string | null;
  /** Keyed by criterionId; one response per criterion, latest wins. */
  responses: Record<string, PreScreeningResponse>;
  startedAt: string;
}

interface TrialState {
  profile: SearchProfile;
  results: Trial[];
  resultsMeta: SearchMeta | null;
  searchState: RequestState;
  searchError: string | null;
  /** Cache of fully-detailed records keyed by NCT id. */
  detailCache: Record<string, Trial>;
  shortlist: ShortlistEntry[];
  questions: ScreeningQuestion[];
  /** NCT id whose detail panel is open, or null. */
  openTrialId: string | null;
  /** The one active pre-screening session, or null. */
  preScreening: PreScreeningSession | null;
  /** Bumped whenever an agent writes, so the UI can flash the changed region. */
  lastAgentActionAt: string | null;
  lastAgentAction: string | null;

  setProfile: (update: ProfileUpdate) => SearchProfile;
  replaceProfile: (profile: SearchProfile) => void;
  setSearchState: (state: RequestState, error?: string | null) => void;
  setResults: (trials: Trial[], meta: SearchMeta) => void;
  cacheDetail: (trial: Trial) => void;
  addToShortlist: (trial: Trial, note: string | null, source: "agent" | "human") => boolean;
  removeFromShortlist: (nctId: string) => boolean;
  addQuestion: (question: Omit<ScreeningQuestion, "id" | "createdAt">) => ScreeningQuestion;
  removeQuestion: (id: string) => boolean;
  setOpenTrialId: (nctId: string | null) => void;
  startPreScreening: (session: PreScreeningSession) => void;
  recordPreScreeningResponses: (nctId: string, responses: PreScreeningResponse[]) => number;
  clearPreScreening: () => void;
  noteAgentAction: (action: string) => void;
  clearEverything: () => void;
}

const STORAGE_KEY = "trialbridge:v1";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      profile: EMPTY_PROFILE,
      results: [],
      resultsMeta: null,
      searchState: "idle",
      searchError: null,
      detailCache: {},
      shortlist: [],
      questions: [],
      openTrialId: null,
      preScreening: null,
      lastAgentActionAt: null,
      lastAgentAction: null,

      setProfile: (update) => {
        // Re-validate the merged object so an agent write can never place a
        // value in the profile that the form itself would reject.
        const merged = profileSchema.parse({ ...get().profile, ...update });
        set({ profile: merged });
        return merged;
      },

      replaceProfile: (profile) => set({ profile }),

      setSearchState: (state, error = null) => set({ searchState: state, searchError: error }),

      setResults: (trials, meta) =>
        set((s) => ({
          results: trials,
          resultsMeta: meta,
          searchState: "success",
          searchError: null,
          // Search results carry full modules, so they double as detail records.
          detailCache: {
            ...s.detailCache,
            ...Object.fromEntries(trials.map((t) => [t.nctId, t])),
          },
        })),

      cacheDetail: (trial) =>
        set((s) => ({ detailCache: { ...s.detailCache, [trial.nctId]: trial } })),

      addToShortlist: (trial, note, source) => {
        if (get().shortlist.some((e) => e.trial.nctId === trial.nctId)) return false;
        set((s) => ({
          shortlist: [
            ...s.shortlist,
            { trial, note, source, addedAt: new Date().toISOString() },
          ],
        }));
        return true;
      },

      removeFromShortlist: (nctId) => {
        const before = get().shortlist.length;
        set((s) => ({ shortlist: s.shortlist.filter((e) => e.trial.nctId !== nctId) }));
        return get().shortlist.length < before;
      },

      addQuestion: (question) => {
        const entry: ScreeningQuestion = {
          ...question,
          id: newId(),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ questions: [...s.questions, entry] }));
        return entry;
      },

      removeQuestion: (id) => {
        const before = get().questions.length;
        set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
        return get().questions.length < before;
      },

      setOpenTrialId: (nctId) => set({ openTrialId: nctId }),

      /** Replaces any existing session — only one trial is pre-screened at a time. */
      startPreScreening: (session) => set({ preScreening: session }),

      /**
       * Merges responses into the active session.
       *
       * Responses naming a criterion that does not belong to the active study
       * are ignored, so an answer can never be attached to the wrong trial.
       * The caller validates and reports this too; the guard is repeated here
       * because the store is the last line of defence.
       *
       * @returns how many responses were actually applied.
       */
      recordPreScreeningResponses: (nctId, responses) => {
        const session = get().preScreening;
        if (!session || session.nctId !== nctId) return 0;

        const known = new Set(session.criteria.map((c) => c.criterionId));
        const accepted = responses.filter((r) => known.has(r.criterionId));
        if (!accepted.length) return 0;

        set({
          preScreening: {
            ...session,
            responses: {
              ...session.responses,
              ...Object.fromEntries(accepted.map((r) => [r.criterionId, r])),
            },
          },
        });
        return accepted.length;
      },

      clearPreScreening: () => set({ preScreening: null }),

      noteAgentAction: (action) =>
        set({ lastAgentAction: action, lastAgentActionAt: new Date().toISOString() }),

      /** Backs the "Clear my information" control. Wipes memory and storage. */
      clearEverything: () => {
        set({
          profile: EMPTY_PROFILE,
          results: [],
          resultsMeta: null,
          searchState: "idle",
          searchError: null,
          detailCache: {},
          shortlist: [],
          questions: [],
          openTrialId: null,
          preScreening: null,
          lastAgentActionAt: null,
          lastAgentAction: null,
        });
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Storage may be unavailable (private mode); in-memory clear stands.
          }
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 2,
      /**
       * v1 → v2: searching was narrowed to enrolling statuses only.
       *
       * A browser that used the earlier build may hold statuses such as
       * COMPLETED in its saved profile. Rehydrating that straight into
       * `profileSchema` would throw and leave the app stuck, so unsupported
       * values are dropped here and the default restored if nothing survives.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version >= 2) return state;

        const profile = (state.profile ?? {}) as Record<string, unknown>;
        const previous = Array.isArray(profile.recruitmentStatuses)
          ? profile.recruitmentStatuses
          : [];
        const kept = previous.filter((s): s is SearchableRecruitmentStatus =>
          (SEARCHABLE_RECRUITMENT_STATUSES as readonly string[]).includes(s as string),
        );

        return {
          ...state,
          profile: {
            ...profile,
            recruitmentStatuses: kept.length ? kept : [DEFAULT_SEARCH_STATUS],
          },
        };
      },
      // Transient request state and cached upstream payloads are not persisted.
      // The pre-screening session is persisted so a refresh does not destroy
      // the answers someone has just given. It is the most sensitive data the
      // app holds, so it stays in this browser only, is never sent to
      // ClinicalTrials.gov or the search API, and is wiped by both the
      // session's own Clear control and "Clear my information".
      partialize: (s) => ({
        profile: s.profile,
        shortlist: s.shortlist,
        questions: s.questions,
        preScreening: s.preScreening,
      }),
    },
  ),
);

/**
 * Builds the search payload from the current profile.
 *
 * Note what is *not* copied across: `age` and `sex`. They stay in the browser
 * and are used only by the local analysis — see the note on `searchInputSchema`.
 *
 * Returns null when the mandatory condition field is empty.
 */
export function searchInputFromProfile(profile: SearchProfile): SearchInput | null {
  if (!profile.condition.trim()) return null;
  return {
    condition: profile.condition.trim(),
    city: profile.city || null,
    state: profile.state || null,
    country: profile.country || null,
    travelDistanceMiles: profile.travelDistanceMiles,
    recruitmentStatuses: profile.recruitmentStatuses,
    phases: profile.phases,
    keywords: profile.keywords || null,
    pageSize: 20,
  };
}
