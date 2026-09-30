"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type Form = z.infer<typeof schema>;

type LoginFormProps = {
  ssoEnabled?: boolean;
  ssoButtonLabel?: string;
  /** Org slug hint, forwarded through the SSO round-trip so the post-login
   * landing keeps the tenant context (per-org IdP dispatch is a follow-up). */
  orgHint?: string;
};

const authInput =
  "h-10 w-full rounded-md border border-white/25 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 transition-all focus:border-white/70 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/30";

const authIcon =
  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40";

export function LoginForm({
  ssoEnabled = false,
  ssoButtonLabel = "Sign in with SSO",
  orgHint,
}: LoginFormProps) {
  const t = useTranslations("auth.login");
  const tSso = useTranslations("auth.sso");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const err = search?.get("error");
    if (!err) return;
    if (err === "AccessDenied") setServerError(tSso("errors.denied"));
    else if (err === "OAuthCallbackError" || err === "OAuthSignin")
      setServerError(tSso("errors.failed"));
    else setServerError(tSso("errors.unknown"));
  }, [search, tSso]);

  async function onSubmit(values: Form) {
    setServerError(null);
    try {
      const res = await signIn("credentials", { ...values, redirect: false });
      if (res?.error) {
        setServerError(tErr("invalidCredentials"));
        return;
      }
      router.push("/");
    } catch {
      setServerError(tErr("unexpected"));
    }
  }

  return (
    <div className="space-y-5">
      {ssoEnabled && (
        <>
          <Button
            type="button"
            onClick={() =>
              signIn("oidc", {
                callbackUrl: orgHint
                  ? `/?org=${encodeURIComponent(orgHint)}`
                  : "/",
              })
            }
            className="h-10 w-full rounded-md border border-white/20 bg-white/10 text-sm font-medium text-white/90 backdrop-blur-sm hover:bg-white/20 hover:border-white/30"
          >
            {ssoButtonLabel}
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/15" />
            <span className="text-[11px] text-white/40 uppercase tracking-wider">
              {tSso("divider")}
            </span>
            <div className="h-px flex-1 bg-white/15" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <header className="text-center space-y-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-white">
            {t("title")}
          </h2>
          <p className="text-[13px] text-white/60">{t("subtitle")}</p>
        </header>

        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-[12px] font-medium text-white/70"
          >
            {t("email")}
          </label>
          <div className="relative">
            <Mail aria-hidden="true" className={authIcon} />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              className={`${authInput} pl-9`}
            />
          </div>
          {errors.email && (
            <p className="text-[11px] text-red-300">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-[12px] font-medium text-white/70"
          >
            {t("password")}
          </label>
          <div className="relative">
            <Lock aria-hidden="true" className={authIcon} />
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              {...register("password")}
              className={`${authInput} pl-9 pr-10`}
            />
            <button
              type="button"
              aria-label={showPwd ? t("hidePassword") : t("showPassword")}
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
            >
              {showPwd ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-[11px] text-red-300">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-10 w-full rounded-md bg-white/15 border border-white/20 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/25 hover:border-white/35 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            t("submit")
          )}
        </Button>
      </form>
    </div>
  );
}
