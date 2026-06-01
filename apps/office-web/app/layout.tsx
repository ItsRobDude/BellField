import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BellField Office',
  description: 'BellField office dispatch, jobs, and customer management.'
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
