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

/** Steps a grower may skip; the report is complete without them. */
export const OPTIONAL_STEPS: ReadonlySet<StepId> = new Set<StepId>(['summary']);

export const stepIndex = (step: StepId) => STEPS.indexOf(step);
export const nextStep = (step: StepId): StepId | null => STEPS[stepIndex(step) + 1] ?? null;
export const previousStep = (step: StepId): StepId | null => (stepIndex(step) > 0 ? STEPS[stepIndex(step) - 1] : null);

export function isStepId(value: string | null | undefined): value is StepId {
  return STEPS.includes(value as StepId);
}
