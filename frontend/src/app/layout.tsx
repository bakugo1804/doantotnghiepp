import type { Metadata } from 'next';
import { Manrope, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: 'Quản Lý Hải Quan',
  description: 'Hệ thống quản lý dữ liệu hải quan',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${manrope.variable} ${plusJakarta.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
