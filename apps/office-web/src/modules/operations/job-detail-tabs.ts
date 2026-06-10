import { useCallback, useRef } from 'react';
import type { JobDetailTab } from './job-work-types';

export const jobDetailTabs: Array<{ id: JobDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'captured', label: 'Captured' },
  { id: 'estimates', label: 'Estimates' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'jobCost', label: 'Job cost' },
  { id: 'media', label: 'Media' },
  { id: 'timeline', label: 'Timeline' }
];

/**
 * Tab navigation with a veto hook: switching tabs unmounts the active
 * section, so a section holding unsaved work (the estimates draft) registers
 * a guard that can block the change behind a confirm.
 */
export function useJobDetailTabGuard(
  activeTab: JobDetailTab,
  setActiveTab: (tab: JobDetailTab) => void,
  guardedTab: JobDetailTab
): {
  registerGuard: (guard: (() => boolean) | null) => void;
  changeTab: (tab: JobDetailTab) => void;
} {
  const guardRef = useRef<(() => boolean) | null>(null);
  const registerGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard;
  }, []);
  const changeTab = useCallback(
    (tab: JobDetailTab) => {
      if (tab === activeTab) {
        return;
      }
      if (activeTab === guardedTab && guardRef.current && !guardRef.current()) {
        return;
      }
      setActiveTab(tab);
    },
    [activeTab, guardedTab, setActiveTab]
  );

  return { registerGuard, changeTab };
}
