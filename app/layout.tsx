import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aventaofertas.com");

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AVENTA - Comunidad de cazadores de ofertas",
  description: "Las mejores ofertas que la comunidad encuentra. Ofertas nuevas cada día. No vendemos nada — somos cazadores de ofertas.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AVENTA" },
  icons: { icon: "/placeholder.png", apple: "/placeholder.png" },
  openGraph: {
    title: "AVENTA - Comunidad de cazadores de ofertas",
    description: "Las mejores ofertas que la comunidad encuentra. Ofertas nuevas cada día.",
    siteName: "AVENTA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AVENTA - Comunidad de cazadores de ofertas",
    description: "Las mejores ofertas que la comunidad encuentra.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('aventa-theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0`}
      >
        <Providers>
          {children}
        </Providers>
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-4 px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          <a href="/privacy" className="underline hover:text-violet-600 dark:hover:text-violet-400">Política de Privacidad</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="underline hover:text-violet-600 dark:hover:text-violet-400">Términos y Condiciones</a>
        </footer>
      </body>
    </html>
  );
}
