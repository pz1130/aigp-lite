import { getTranslations } from "next-intl/server";
import { GalaxyClient } from "@/components/visual/GalaxyClient";
import { SplitText } from "@/components/visual/SplitText";
import type { ReactNode } from "react";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("auth.brand");
  const tagline = t("tagline");
  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      <GalaxyClient />
      <div className="relative z-10 grid min-h-dvh md:grid-cols-2">
        {/* LEFT: brand headline — hidden on small screens */}
        <section className="hidden items-center justify-center px-12 md:flex xl:px-20">
          <h1 className="text-center">
            <SplitText
              text={tagline}
              className="whitespace-nowrap text-3xl font-semibold leading-tight tracking-tight text-white lg:text-4xl xl:text-5xl 2xl:text-6xl"
            />
          </h1>
        </section>

        {/* RIGHT (or full width on small): glass form panel */}
        <section className="flex items-center justify-center px-6 py-8 md:px-12">
          <div
            className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 backdrop-blur-xl"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.37)" }}
          >
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
