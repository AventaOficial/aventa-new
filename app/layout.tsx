import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Providers from "./providers";
import CookieNotice from "./components/CookieNotice";
import SocialIcons from "./components/SocialIcons";
import { getSocialLinks } from "@/lib/social/config";
import {
  AFFILIATE_DISCLOSURE_ES,
  AMAZON_ASSOCIATES_DISCLOSURE,
} from "@/lib/commissions/programStatus";

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
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "AVENTA · Ofertas de la comunidad",
    template: "%s | AVENTA",
  },
  description:
    "Comunidad de ofertas en México. Publica, vota y caza precios reales antes de comprar.",
  applicationName: "AVENTA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AVENTA" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "AVENTA · Ofertas de la comunidad",
    description: "Comunidad de ofertas en México. Publica, vota y caza precios reales.",
    siteName: "AVENTA",
    locale: "es_MX",
    type: "website",
    url: baseUrl,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AVENTA · Ofertas de la comunidad",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AVENTA · Ofertas de la comunidad",
    description: "Comunidad de ofertas en México. Publica, vota y caza precios reales.",
    images: ["/opengraph-image"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const social = await getSocialLinks();
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-[calc(5.5rem+0.65rem+env(safe-area-inset-bottom,0px))] md:pb-0`}
      >
        <Providers>
          {children}
          <CookieNotice />
        </Providers>
        <footer className="relative z-10 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141414] px-4 py-8 md:py-10 text-sm text-gray-600 dark:text-gray-400">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 md:grid-cols-4">
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  AVENTA
                </h3>
                <p className="mt-2 max-w-xl leading-relaxed">
                  Comunidad de ofertas en México. Publicamos, votamos y ordenamos el listado según el valor real de cada hallazgo.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
                  El ranking no se compra: lo definen los votos de la comunidad.
                </p>
                <SocialIcons social={social} />
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Producto</h4>
                <ul className="mt-2 space-y-1.5">
                  <li><Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">Inicio</Link></li>
                  <li><Link href="/descubre" className="hover:text-violet-600 dark:hover:text-violet-400">Guía rápida</Link></li>
                  <li><Link href="/plaza" className="hover:text-violet-600 dark:hover:text-violet-400">Plaza</Link></li>
                  <li><Link href="/subir" className="hover:text-violet-600 dark:hover:text-violet-400">Subir oferta</Link></li>
                  <li><Link href="/extension" className="hover:text-violet-600 dark:hover:text-violet-400">Extensión (próx.)</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Legal y soporte</h4>
                <ul className="mt-2 space-y-1.5">
                  <li><Link href="/privacy" className="hover:text-violet-600 dark:hover:text-violet-400">Política de privacidad</Link></li>
                  <li><Link href="/terms" className="hover:text-violet-600 dark:hover:text-violet-400">Términos y condiciones</Link></li>
                  <li><Link href="/comisiones" className="hover:text-violet-600 dark:hover:text-violet-400">Programa de comisiones</Link></li>
                  <li><Link href="/settings" className="hover:text-violet-600 dark:hover:text-violet-400">Configuración de cuenta</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-4">
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-500">
                {AFFILIATE_DISCLOSURE_ES}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-500 italic">
                {AMAZON_ASSOCIATES_DISCLOSURE}
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
