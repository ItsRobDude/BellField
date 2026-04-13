import type { CSSProperties } from 'react';

export const officeWorkspaceStyles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f1e8', color: '#1f2933', fontFamily: 'Arial, sans-serif', padding: '2rem' },
  card: { background: '#fffdf7', border: '1px solid #e5dcc8', borderRadius: 20, margin: '0 auto 1rem', maxWidth: '76rem', padding: '1.5rem' },
  row: { alignItems: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap' },
  grid: { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' },
  list: { display: 'grid', gap: '1rem' },
  formRow: { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', margin: '1rem 0' },
  panel: { background: '#ffffff', border: '1px solid #eadfc9', borderRadius: 16, display: 'grid', gap: '0.75rem', padding: '1rem' },
  subpanel: { background: '#faf7ef', borderRadius: 12, display: 'grid', gap: '0.5rem', padding: '0.75rem' },
  input: { background: '#ffffff', border: '1px solid #d9c8ad', borderRadius: 12, fontSize: '0.95rem', padding: '0.75rem 0.9rem' },
  button: { background: '#ffffff', border: '1px solid #cdbfa6', borderRadius: 999, color: '#1f2933', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, padding: '0.75rem 1rem' },
  inlineLabel: { alignItems: 'center', display: 'flex', gap: '0.5rem', fontSize: '0.95rem', fontWeight: 600 },
  title: { fontSize: '2rem', margin: '0 0 0.25rem' },
  heading: { fontSize: '1.15rem', margin: 0 },
  kicker: { color: '#9a6b2f', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '0.5rem', textTransform: 'uppercase' },
  muted: { color: '#52606d', margin: 0 },
  error: { color: '#b42318', margin: '0.75rem 0 0' },
  timeline: { margin: 0, paddingInlineStart: '1.1rem' }
};
