import type { CSSProperties } from 'react';

export const officeWorkspaceStyles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f7f4',
    color: '#1f2933',
    fontFamily: 'Arial, sans-serif',
    padding: 0
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: 'clamp(6.5rem, 18vw, 7.5rem) minmax(0, 1fr)',
    minHeight: '100vh'
  },
  rail: {
    background: '#182b2f',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    justifyContent: 'space-between',
    padding: '0.55rem'
  },
  railNav: { display: 'grid', gap: '0.5rem' },
  railBrand: { fontSize: '1rem', fontWeight: 800, margin: '0 0 0.75rem' },
  railButton: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 8,
    color: '#dbe7e5',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    padding: '0.65rem 0.55rem',
    textAlign: 'left'
  },
  activeRailButton: {
    background: '#24494d',
    border: '1px solid #3a686d',
    borderRadius: 8,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 800,
    padding: '0.65rem 0.55rem',
    textAlign: 'left'
  },
  workArea: { alignContent: 'start', display: 'grid', gap: '1rem', minWidth: 0, padding: '1rem' },
  accountDock: {
    display: 'grid',
    gap: '0.5rem',
    justifyItems: 'start',
    position: 'relative'
  },
  accountButton: {
    alignItems: 'center',
    background: '#0f1e21',
    border: '1px solid #3a686d',
    borderRadius: 999,
    color: '#ffffff',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '0.85rem',
    fontWeight: 900,
    height: '2rem',
    justifyContent: 'center',
    width: '2rem'
  },
  accountMenu: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    bottom: '2.5rem',
    boxShadow: '0 0.65rem 1.5rem rgba(15, 30, 33, 0.22)',
    color: '#1f2933',
    display: 'grid',
    gap: '0.5rem',
    left: 0,
    minWidth: '14rem',
    padding: '0.75rem',
    position: 'absolute',
    zIndex: 5
  },
  accountMenuButton: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    color: '#1f2933',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 800,
    padding: '0.55rem 0.7rem',
    textAlign: 'left'
  },
  workspacePanel: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    alignContent: 'start',
    display: 'grid',
    gap: '1rem',
    minWidth: 0,
    padding: '1rem'
  },
  card: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    margin: '0 auto 1rem',
    maxWidth: '76rem',
    padding: '1.25rem'
  },
  row: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'space-between',
    flexWrap: 'wrap'
  },
  grid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))'
  },
  splitGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))'
  },
  wideSplitGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(20rem, 1fr)'
  },
  list: { display: 'grid', gap: '1rem' },
  listCompact: { display: 'grid', gap: '0.5rem' },
  formRow: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
    margin: '1rem 0'
  },
  formGridCompact: {
    display: 'grid',
    gap: '0.65rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))'
  },
  formGridFullWidth: {
    gridColumn: '1 / -1'
  },
  formSection: {
    borderTop: '1px solid #dfe6df',
    display: 'grid',
    gap: '0.75rem',
    paddingTop: '0.85rem'
  },
  detailGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))'
  },
  queueGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))'
  },
  panel: {
    alignContent: 'start',
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    display: 'grid',
    gap: '0.75rem',
    padding: '0.9rem'
  },
  mutedPanel: {
    alignContent: 'start',
    background: '#f7f8f6',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    display: 'grid',
    gap: '0.75rem',
    opacity: 0.78,
    padding: '0.9rem'
  },
  subpanel: {
    background: '#f7f8f6',
    borderRadius: 8,
    display: 'grid',
    gap: '0.5rem',
    padding: '0.75rem'
  },
  drawerPanel: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    display: 'grid',
    gap: '0.85rem',
    minHeight: '18rem',
    padding: '1rem'
  },
  input: {
    background: '#ffffff',
    border: '1px solid #cfd8d2',
    borderRadius: 8,
    boxSizing: 'border-box',
    fontSize: '0.95rem',
    minWidth: 0,
    overflow: 'hidden',
    padding: '0.65rem 0.75rem',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%'
  },
  textarea: {
    background: '#ffffff',
    border: '1px solid #cfd8d2',
    borderRadius: 8,
    boxSizing: 'border-box',
    fontSize: '0.95rem',
    minHeight: '5rem',
    padding: '0.75rem 0.9rem',
    resize: 'vertical',
    width: '100%'
  },
  button: {
    background: '#ffffff',
    border: '1px solid #b9c7c0',
    borderRadius: 8,
    color: '#1f2933',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    padding: '0.65rem 0.9rem'
  },
  primaryButton: {
    background: '#176b5b',
    border: '1px solid #176b5b',
    borderRadius: 8,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 800,
    padding: '0.65rem 0.9rem'
  },
  dangerButton: {
    background: '#fff7f6',
    border: '1px solid #f5b5ae',
    borderRadius: 8,
    color: '#b42318',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 800,
    padding: '0.65rem 0.9rem'
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  badge: {
    background: '#e8f2ee',
    borderRadius: 6,
    color: '#176b5b',
    fontSize: '0.8rem',
    fontWeight: 800,
    padding: '0.25rem 0.55rem'
  },
  dangerBadge: {
    background: '#fde7e5',
    borderRadius: 6,
    color: '#b42318',
    fontSize: '0.8rem',
    fontWeight: 800,
    padding: '0.25rem 0.55rem'
  },
  cardButton: {
    background: '#ffffff',
    border: '1px solid #dfe6df',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'grid',
    gap: '0.35rem',
    padding: '0.75rem',
    textAlign: 'left',
    width: '100%'
  },
  inlineLabel: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: 600
  },
  title: { fontSize: '2rem', margin: '0 0 0.25rem' },
  compactTitle: { fontSize: '1.35rem', margin: 0 },
  heading: { fontSize: '1.15rem', margin: 0 },
  sectionHeading: { fontSize: '0.95rem', fontWeight: 800, margin: 0 },
  subheading: { fontSize: '1rem', margin: 0 },
  kicker: {
    color: '#176b5b',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    marginBottom: '0.5rem',
    textTransform: 'uppercase'
  },
  muted: { color: '#52606d', margin: 0 },
  tinyMuted: { color: '#7b8794', fontSize: '0.85rem', margin: 0 },
  fieldLabel: { display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 800 },
  fieldText: { color: '#52606d', fontSize: '0.85rem', fontWeight: 800 },
  detailHeader: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    justifyContent: 'space-between'
  },
  tabList: { borderBottom: '1px solid #dfe6df', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' },
  tabButton: {
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: '#52606d',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 800,
    padding: '0.65rem 0.8rem'
  },
  activeTabButton: {
    background: 'transparent',
    border: 'none',
    borderBottom: '3px solid #176b5b',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 900,
    padding: '0.65rem 0.8rem'
  },
  inlineActionBar: { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' },
  notice: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 8,
    color: '#065f46',
    margin: 0,
    padding: '0.65rem 0.8rem'
  },
  error: { color: '#b42318', margin: '0.75rem 0 0' },
  timeline: { margin: 0, paddingInlineStart: '1.1rem' },
  tableWrap: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%' },
  tableHeadCell: {
    borderBottom: '1px solid #dfe6df',
    color: '#52606d',
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.75rem 0.5rem',
    textAlign: 'left',
    textTransform: 'uppercase'
  },
  tableCell: { borderBottom: '1px solid #edf2ee', padding: '0.75rem 0.5rem', verticalAlign: 'top' },
  tableRowButton: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    width: '100%'
  },
  tableLinkButton: {
    background: 'transparent',
    border: 'none',
    color: '#176b5b',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    padding: 0,
    textAlign: 'left'
  }
};
