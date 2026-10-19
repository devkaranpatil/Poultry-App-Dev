import type { SchemeSubsidy } from '@/types/greenhouse';

// Steps to claim the polyhouse subsidy, taken from the official documents in datasets/knowledge (see its
// manifest.json). Every step names its source; nothing here is the app's own advice. The text of each step lives
// in src/i18n/messages.ts under `apply.*`.

export type ChecklistScheme = SchemeSubsidy['scheme'];
export type ChecklistSource = 'nhb' | 'midh' | 'telangana';

export interface ChecklistStep {
  /** Stable id: the text is `apply.<nhb|midh>.<id>` and a tick is stored under it. */
  id: string;
  /** Values for the step's text, e.g. the NHB application fee. */
  vars?: Record<string, string | number>;
  source: ChecklistSource;
}

export const CHECKLIST_SOURCES: Record<ChecklistSource, { document: string; url: string }> = {
  nhb: {
    document: 'NHB Scheme-1 Operational Guidelines: Development of Commercial Horticulture',
    url: 'https://nhb.gov.in/pdf/SCHEME1Guidelinefinal.pdf',
  },
  midh: {
    document: 'MIDH Operational Guidelines 2025',
    url: 'https://nhb.gov.in/writereaddata/082825102800MIDH%20Guideline%202025.pdf',
  },
  telangana: {
    document: 'Department of Horticulture, Telangana: poly house implementation guidelines',
    url: 'https://horticulture.tg.nic.in/polyhouse/Downloads/Technical%20Specification.pdf',
  },
};

/** NHB application fee for In-Principle Approval by project cost (NHB guidelines, section 5), in rupees. */
export function nhbApplicationFee(projectCost: number): number {
  if (projectCost <= 10_00_000) return 1_000;
  if (projectCost <= 20_00_000) return 2_000;
  if (projectCost <= 50_00_000) return 5_000;
  return 10_000;
}

const NHB_STEPS = ['land', 'dpr', 'loan', 'ipa', 'fee', 'documents', 'build', 'inspection', 'reserve'] as const;
const MIDH_STEPS = ['district', 'bis', 'norm'] as const;
const TELANGANA_STEPS = ['owner', 'water', 'verification', 'seniority', 'training'] as const;

/** The steps for the scheme that applies to this project, plus the state's own rules where the app has them. */
export function buildChecklist(scheme: ChecklistScheme, projectCost: number, state: string): ChecklistStep[] {
  if (scheme === 'NHB') {
    return NHB_STEPS.map((id) =>
      id === 'fee'
        ? { id, source: 'nhb', vars: { fee: nhbApplicationFee(projectCost).toLocaleString('en-IN') } }
        : { id, source: 'nhb' }
    );
  }
  const steps: ChecklistStep[] = MIDH_STEPS.map((id) => ({ id, source: 'midh' }));
  if (state.trim().toLowerCase() === 'telangana') {
    steps.push(...TELANGANA_STEPS.map((id) => ({ id: `telangana-${id}`, source: 'telangana' as const })));
  }
  return steps;
}

/** i18n key of a step. */
export const checklistKey = (scheme: ChecklistScheme, step: ChecklistStep) =>
  `apply.${scheme === 'NHB' ? 'nhb' : 'midh'}.${step.id}`;
