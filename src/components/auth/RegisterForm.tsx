"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "@/i18n/routing";
import { signIn } from "next-auth/react";
import {
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  orgName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
type Form = z.infer<typeof schema>;

const authInput =
  "h-11 w-full rounded-md border border-white/30 bg-white/5 px-3 text-sm text-white placeholder:text-white/50 transition-colors focus:border-white/70 focus:outline-none focus:ring-2 focus:ring-white/30";

const authIcon =
  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60";

const fields = [
  { key: "orgName" as const, type: "text", Icon: Building2 },
  { key: "name" as const, type: "text", Icon: User },
  { key: "email" as const, type: "email", Icon: Mail },
  { key: "password" as const, type: "password", Icon: Lock },
];

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const register = trpc.auth.register.useMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const {
    register: f,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setServerError(null);
    try {
      await register.mutateAsync(values);
      const res = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (res?.error) throw new Error(res.error);
      router.push("/");
    } catch (e) {
      if (e instanceof TRPCClientError && e.data?.code === "CONFLICT") {
        setServerError(tErr("emailTaken"));
      } else {
        setServerError(tErr("unexpected"));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <header className="space-y-1 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-white">
          {t("title")}
        </h2>
      </header>

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100"
        >
          {serverError}
        </div>
      )}

      {fields.map(({ key, type, Icon }) => (
        <div key={key} className="space-y-1.5">
          <label
            htmlFor={key}
            className="block text-sm font-medium text-white/90"
          >
            {t(key)}
          </label>
          <div className="relative">
            <Icon aria-hidden="true" className={authIcon} />
            <Input
              id={key}
              type={key === "password" ? (showPwd ? "text" : "password") : type}
              autoComplete={
                key === "password"
                  ? "new-password"
                  : key === "email"
                    ? "email"
                    : undefined
              }
              {...f(key)}
              className={`${authInput}${key === "password" ? " pr-10" : " pl-9"}`}
            />
            {key === "password" && (
              <button
                type="button"
                aria-label={showPwd ? t("hidePassword") : t("showPassword")}
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showPwd ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          {errors[key] && (
            <p className="text-xs text-red-200">
              {errors[key]?.message as string}
            </p>
          )}
        </div>
      ))}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-md border border-white/30 bg-white/20 px-4 text-sm font-medium text-white shadow-sm hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          t("submit")
        )}
      </Button>
    </form>
  );
}
