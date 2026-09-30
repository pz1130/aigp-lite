"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";

type State =
  | { phase: "loading" }
  | {
      phase: "error";
      key:
        | "invalid"
        | "expired"
        | "revoked"
        | "already_accepted"
        | "email_mismatch";
    }
  | { phase: "success" }
  | { phase: "set_password" }
  | { phase: "sso" }
  | { phase: "sign_in" };

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("members.acceptInvite");
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const probe = trpc.members.acceptInvite.useMutation();
  const accept = trpc.members.acceptInvite.useMutation();

  useEffect(() => {
    if (!token) return setState({ phase: "error", key: "invalid" });
    probe
      .mutateAsync({ token })
      .then((res) => {
        if ("added" in res && res.added) return setState({ phase: "success" });
        if ("next" in res) {
          if (res.next === "set_password")
            return setState({ phase: "set_password" });
          if (res.next === "sso") return setState({ phase: "sso" });
          if (res.next === "sign_in") return setState({ phase: "sign_in" });
        }
        setState({ phase: "error", key: "invalid" });
      })
      .catch((err) => {
        const msg = (err.message ?? "").toLowerCase();
        const key =
          (
            [
              "invalid",
              "expired",
              "revoked",
              "already_accepted",
              "email_mismatch",
            ] as const
          ).find((k) => msg.includes(k.replace("_", " ")) || msg.includes(k)) ??
          "invalid";
        setState({ phase: "error", key });
      });
  }, [token]);

  if (state.phase === "loading") return <p>...</p>;

  if (state.phase === "error") {
    return (
      <div className="rounded bg-danger-subtle p-4 text-sm text-danger">
        {t(`error.${state.key}`)}
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-medium">{t("title.success")}</h1>
        <Button onClick={() => router.push("/")}>{t("goToDashboard")}</Button>
      </div>
    );
  }

  if (state.phase === "sign_in") {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-medium">{t("title.signIn")}</h1>
        <Button
          onClick={() =>
            router.push(
              `/signin?callbackUrl=/accept-invite?token=${encodeURIComponent(token)}`,
            )
          }
        >
          {t("submit")}
        </Button>
      </div>
    );
  }

  if (state.phase === "sso") {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-medium">{t("title.sso")}</h1>
        <Button
          onClick={() =>
            router.push(
              `/signin?callbackUrl=/accept-invite?token=${encodeURIComponent(token)}&provider=oidc`,
            )
          }
        >
          {t("ssoButton")}
        </Button>
      </div>
    );
  }

  // set_password
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
          const res = await accept.mutateAsync({ token, password });
          if ("added" in res && res.added) {
            router.push("/signin?callbackUrl=/");
          }
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h1 className="text-lg font-medium">{t("title.setPassword")}</h1>
      <label className="block text-sm">
        <span className="mb-1 block text-secondary">{t("passwordLabel")}</span>
        <Input
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <Button type="submit" disabled={submitting || password.length < 8}>
        {t("submit")}
      </Button>
    </form>
  );
}
