import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Providers from "./providers";
import CookieNotice from "./components/CookieNotice";

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
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/icon.svg'],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
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
          <CookieNotice />
        </Providers>
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-8 md:py-10 text-sm text-gray-600 dark:text-gray-400">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 md:grid-cols-4">
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Bienvenido a AVENTA
                </h3>
                <p className="mt-2 max-w-xl leading-relaxed">
                  Comunidad de cazadores de ofertas reales. Compartimos oportunidades, opiniones y contexto para decidir mejor.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
                  Transparencia: la visibilidad de las ofertas depende del apoyo de la comunidad y señales de calidad. Los acuerdos comerciales no compran posición en el feed.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Producto</h4>
                <ul className="mt-2 space-y-1.5">
                  <li><Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">Inicio</Link></li>
                  <li><Link href="/descubre" className="hover:text-violet-600 dark:hover:text-violet-400">Descubre</Link></li>
                  <li><Link href="/subir" className="hover:text-violet-600 dark:hover:text-violet-400">Subir oferta</Link></li>
                  <li><Link href="/extension" className="hover:text-violet-600 dark:hover:text-violet-400">Extensión</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Legal y soporte</h4>
                <ul className="mt-2 space-y-1.5">
                  <li><Link href="/privacy" className="hover:text-violet-600 dark:hover:text-violet-400">Política de privacidad</Link></li>
                  <li><Link href="/terms" className="hover:text-violet-600 dark:hover:text-violet-400">Términos y condiciones</Link></li>
                  <li><Link href="/settings" className="hover:text-violet-600 dark:hover:text-violet-400">Configuración de cuenta</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-4">
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-500">
                Podemos recibir compensación por algunos enlaces comerciales. Esto ayuda a mantener AVENTA gratuita; no altera el criterio de ranking comunitario.
              </p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                Copyright © {new Date().getFullYear()} AVENTA. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
