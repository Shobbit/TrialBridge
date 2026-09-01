/**
 * Test fixtures.
 *
 * These are entirely synthetic records shaped like real ClinicalTrials.gov v2
 * responses. No real study, sponsor, investigator or patient information
 * appears anywhere in this file.
 */

export const rawStudyFixture = {
  protocolSection: {
    identificationModule: {
      nctId: "NCT00000001",
      briefTitle: "A Study of Example Compound in Adults With Example Condition",
      officialTitle:
        "A Randomised, Open-Label Study of Example Compound in Adults With Example Condition",
    },
    statusModule: {
      overallStatus: "RECRUITING",
      statusVerifiedDate: "2026-01",
      startDateStruct: { date: "2025-01-15", type: "ACTUAL" },
      completionDateStruct: { date: "2028-06", type: "ESTIMATED" },
      lastUpdatePostDateStruct: { date: "2026-02-01", type: "ACTUAL" },
    },
    sponsorCollaboratorsModule: {
      leadSponsor: { name: "Example Research Institute" },
      collaborators: [{ name: "Example University" }],
    },
    descriptionModule: {
      briefSummary: "This study evaluates an example compound in adults with an example condition.",
    },
    conditionsModule: { conditions: ["Example Condition", "Example Related Condition"] },
    designModule: {
      studyType: "INTERVENTIONAL",
      phases: ["PHASE2"],
      enrollmentInfo: { count: 120, type: "ESTIMATED" },
    },
    armsInterventionsModule: {
      interventions: [
        { type: "DRUG", name: "Example Compound", description: "Given once daily." },
      ],
    },
    eligibilityModule: {
      eligibilityCriteria:
        "Inclusion Criteria:\n\n1. Adults with a confirmed example condition.\n2. Adequate organ function.\n3. Able to attend study visits.\n\nExclusion Criteria:\n\n1. Prior treatment with an example compound.\n2. Active infection requiring systemic therapy.\n3. Pregnancy or breastfeeding.",
      healthyVolunteers: false,
      sex: "ALL",
      minimumAge: "18 Years",
      maximumAge: "70 Years",
      stdAges: ["ADULT", "OLDER_ADULT"],
    },
    contactsLocationsModule: {
      locations: [
        {
          facility: "Example Medical Centre",
          city: "Chicago",
          state: "Illinois",
          zip: "60601",
          country: "United States",
          status: "RECRUITING",
          geoPoint: { lat: 41.8781, lon: -87.6298 },
        },
        {
          facility: "Example City Hospital",
          city: "New York",
          state: "New York",
          country: "United States",
          status: "RECRUITING",
          geoPoint: { lat: 40.7128, lon: -74.006 },
        },
      ],
    },
  },
};

/** A second synthetic study, used for comparison tests. */
export const rawStudyFixtureB = {
  protocolSection: {
    identificationModule: {
      nctId: "NCT00000002",
      briefTitle: "An Observational Study of Example Condition in Older Adults",
    },
    statusModule: { overallStatus: "ACTIVE_NOT_RECRUITING" },
    sponsorCollaboratorsModule: { leadSponsor: { name: "Example Health Network" } },
    conditionsModule: { conditions: ["Example Condition"] },
    designModule: { studyType: "OBSERVATIONAL", phases: [] },
    eligibilityModule: {
      eligibilityCriteria:
        "Inclusion Criteria:\n\n1. Age 65 and over.\n\nExclusion Criteria:\n\n1. Unable to give consent.",
      sex: "FEMALE",
      minimumAge: "65 Years",
      stdAges: ["OLDER_ADULT"],
    },
    contactsLocationsModule: {
      locations: [
        {
          facility: "Example Regional Clinic",
          city: "Springfield",
          state: "Illinois",
          country: "United States",
          geoPoint: { lat: 39.7817, lon: -89.6501 },
        },
      ],
    },
  },
};

/** Shape of a successful `/api/trials/search` response body. */
export function searchResponseFixture(trials: unknown[]) {
  return {
    trials,
    hiddenTrials: [] as unknown[],
    meta: {
      totalCount: trials.length,
      returnedCount: trials.length,
      removedOffTopic: 0,
      removedByStage: 0,
      hiddenByPriorTreatment: 0,
      recordsChecked: trials.length,
      pagesFetched: 1,
      stopReason: "no-more-pages" as const,
      upstreamUrls: [] as string[],
      nextPageToken: null as string | null,
      retrievedAt: new Date().toISOString(),
      upstreamUrl: "https://clinicaltrials.gov/api/v2/studies?query.cond=example",
      resolvedLocation: null as { label: string; lat: number; lon: number } | null,
      warnings: [] as string[],
    },
  };
}
