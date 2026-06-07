export type DispatchScheduleDraft = {
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  timeWindowLabel: string;
  technicianId: string;
};

export type DispatchScheduleEditorState = {
  appointmentId: string;
  draft: DispatchScheduleDraft;
  errorMessage: string | null;
  isSaving: boolean;
};
