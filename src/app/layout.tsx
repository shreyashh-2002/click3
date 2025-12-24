import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Click Tracer',
  description: 'An app to trace clicks on a 3D model.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none'%3E%3Cpath d='M28 5H4C3.44772 5 3 5.44772 3 6V26C3 26.5523 3.44772 27 4 27H28C28.5523 27 29 26.5523 29 26V6C29 5.44772 28.5523 5 28 5Z' fill='%234285F4'/%3E%3Cpath d='M29 9H3V6C3 5.44772 3.44772 5 4 5H28C28.5523 5 29 5.44772 29 6V9Z' fill='%231E293B'/%3E%3Ccircle cx='7' cy='7' r='1' fill='%234285F4'/%3E%3Ccircle cx='11' cy='7' r='1' fill='%234285F4'/%3E%3C/svg%3E`;

  return (
    <html lang="en">
      <head>
        <link rel="icon" href={favicon} type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">{children}
      <Toaster />
      </body>
    </html>
  );
}
