import type { ShedTab } from './ShedControls';

/** A tab of the sidebar: one part of the shed, or where it will be built. */
export type DesignTab = ShedTab;

/** Tab order follows how a shed is planned: its size and kind, what it is built of, then the birds and their feeding. */
export const DESIGN_TABS: DesignTab[] = ['size', 'housing', 'roof', 'frame', 'roofSheet', 'sideWalls', 'entry', 'birds', 'feeding', 'location'];
