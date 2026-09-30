import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { fontSans, fontMono, fontTabular } from "./fonts";

export const metadata: Metadata = {
  title: "AIGP-Lite",
  description: "Modular AI Governance Platform skeleton",
};

// Root layout owns <html>/<body> so Next can prerender error/not-found pages.
// `[locale]/layout.tsx` provides the NextIntlClientProvider + tRPC Providers.
// `lang` is read from next-intl request context (set by middleware) so
// :lang(zh-CN) selectors in tokens.css apply correctly.
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} ${fontTabular.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
