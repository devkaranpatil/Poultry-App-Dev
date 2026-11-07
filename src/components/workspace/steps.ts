import { BarChart3, Box, FileText, Landmark, MapPin, ShieldAlert, Sparkles, Wallet, type LucideIcon } from 'lucide-react';

/** The planning journey, in the order a grower thinks about it. */
export const STEPS = ['design', 'site', 'cost', 'earnings', 'loan', 'risk', 'summary', 'report'] as const;

export type StepId = (typeof STEPS)[number];

export const STEP_ICONS: Record<StepId, LucideIcon> = {
  design: Box,
  site: MapPin,
  cost: Wallet,
  earnings: BarChart3,
  loan: Landmark,
  risk: ShieldAlert,
  summary: Sparkles,
  report: FileText,
};

/** The three things a grower does, in order: plan the shed, check the money, share it. Every step is in one phase. */
export const PHASES = [
  { id: 'plan', steps: ['design', 'site'] },
  { id: 'money', steps: ['cost', 'earnings', 'loan', 'risk'] },
  { id: 'share', steps: ['summary', 'report'] },
] as const satisfies ReadonlyArray<{ id: string; steps: readonly StepId[] }>;

export type PhaseId = (typeof PHASES)[number]['id'];

export const phaseOf = (step: StepId): PhaseId => PHASES.find((phase) => (phase.steps as readonly StepId[]).includes(step))!.id;

/** Steps whose page is about money: the project figures strip stays on screen there. */
export const MONEY_STEPS: ReadonlySet<StepId> = new Set<StepId>(['cost', 'earnings', 'loan', 'risk', 'summary']);

/** Steps a grower may skip; the report is complete without them. */
export const OPTIONAL_STEPS: ReadonlySet<StepId> = new Set<StepId>(['summary']);

export const stepIndex = (step: StepId) => STEPS.indexOf(step);
export const nextStep = (step: StepId): StepId | null => STEPS[stepIndex(step) + 1] ?? null;
export const previousStep = (step: StepId): StepId | null => (stepIndex(step) > 0 ? STEPS[stepIndex(step) - 1] : null);

export function isStepId(value: string | null | undefined): value is StepId {
  return STEPS.includes(value as StepId);
}
