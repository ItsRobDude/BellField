import { StyleSheet } from 'react-native';

export const fieldWorkspaceStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fb' },
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 108 },
  loadingState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#f7f8fb',
    borderColor: '#e4e8f0',
    borderRadius: 24,
    gap: 16,
    padding: 0
  },
  kicker: {
    color: '#936327',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: { color: '#0b1f44', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dfe5ef',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  jobHomeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d6deea',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  expandedJobCard: {
    backgroundColor: '#ffffff',
    borderColor: '#c9d5e5',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 16
  },
  jobHomeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  detailHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  flexColumn: { flex: 1, gap: 4 },
  noticeCard: {
    backgroundColor: '#eef6f7',
    borderColor: '#bdd9df',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  block: { backgroundColor: '#faf7ef', borderRadius: 14, gap: 8, padding: 12 },
  queueItem: { borderColor: '#ebdec6', borderTopWidth: 1, gap: 8, paddingTop: 10 },
  reviewCard: {
    backgroundColor: '#f3f7ef',
    borderColor: '#d5e2cd',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  queueBadge: {
    borderRadius: 999,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  queueBadgeAlert: { backgroundColor: '#fdecea', color: '#9f1d15' },
  queueBadgeAttention: { backgroundColor: '#fff7e1', color: '#8a5a00' },
  queueBadgeQuiet: { backgroundColor: '#e8f3ed', color: '#1c6b57' },
  segmentedControl: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  segmentButton: {
    borderColor: '#cdbfa6',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  segmentButtonActive: { backgroundColor: '#1c6b57', borderColor: '#1c6b57' },
  segmentButtonText: { color: '#1f2933', fontSize: 13, fontWeight: '700' },
  segmentButtonTextActive: { color: '#ffffff' },
  sectionTitle: { color: '#1f2933', fontSize: 17, fontWeight: '600' },
  sectionTitleSmall: { color: '#1f2933', fontSize: 15, fontWeight: '600' },
  summaryText: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  pendingText: { color: '#8a5a00', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top'
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c6b57',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#cdbfa6',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: { color: '#1f2933', fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.45 },
  dangerButton: {
    alignItems: 'center',
    borderColor: '#d79b92',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  dangerButtonText: { color: '#9f1d15', fontSize: 14, fontWeight: '700' },
  tagButton: {
    backgroundColor: '#eef2e5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tagButtonText: { color: '#33523d', fontSize: 13, fontWeight: '600' },
  replacementOptionList: { gap: 8 },
  catalogPicker: { gap: 8 },
  catalogTagButtonSelected: { backgroundColor: '#1c6b57' },
  catalogTagButtonTextSelected: { color: '#ffffff' },
  replacementOptionButton: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  replacementOptionButtonSelected: {
    backgroundColor: '#1c6b57',
    borderColor: '#1c6b57'
  },
  replacementOptionLabel: { color: '#1f2933', fontSize: 14, fontWeight: '700' },
  replacementOptionLabelSelected: { color: '#ffffff' },
  replacementOptionDetailSelected: { color: '#e8f3ed' },
  registerAdvancedPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  registerComposerCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d5e2cd',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  registerLineAmount: { alignItems: 'flex-end', flexShrink: 0, gap: 4 },
  registerLineSummary: {
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12
  },
  registerTotalRow: {
    alignItems: 'center',
    borderColor: '#e4e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8
  },
  errorText: { color: '#b42318', fontSize: 14 },
  scheduleLabel: { color: '#475569', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  jobCardTitle: { color: '#0b1f44', fontSize: 19, fontWeight: '700', lineHeight: 26 },
  jobCardSummary: { color: '#1f2933', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  jobLocationLine: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  segmentedControlScroller: { marginHorizontal: -4 },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7deea',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    position: 'absolute',
    right: 0
  },
  bottomNavButton: {
    alignItems: 'center',
    borderRadius: 18,
    minWidth: 68,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  bottomNavButtonActive: { backgroundColor: '#d6e7ff' },
  bottomNavText: { color: '#1f2933', fontSize: 12, fontWeight: '700' },
  bottomNavTextActive: { color: '#0b1f44' }
});
