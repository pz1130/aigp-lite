import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers/Providers";
import { ToastRoot } from "@/components/ui/toast-context";
import type { ReactNode } from "react";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.some((supportedLocale) => supportedLocale === locale)) {
    notFound();
  }
  const messages = await getMessages();
  // Set by src/proxy.ts. next-themes writes an inline anti-flash script that
  // Next does not emit and therefore does not nonce itself; without this the
  // CSP blocks it and every load flashes the light theme first.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Providers nonce={nonce}>
        <ToastRoot>{children}</ToastRoot>
      </Providers>
    </NextIntlClientProvider>
  );
}
