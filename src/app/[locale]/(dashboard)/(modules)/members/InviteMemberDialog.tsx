"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

const ALL_ROLES: Role[] = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InviteMemberDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("members");
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const invite = trpc.members.invite.useMutation({
    onSuccess: () => {
      utils.members.listInvites.invalidate();
      setSuccess(true);
      setEmail("");
      setRole("viewer");
      setError(null);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
      }, 1500);
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (/already.*member/i.test(msg)) {
        setError(t("invite.error.alreadyMember"));
      } else if (/pending/i.test(msg)) {
        setError(t("invite.error.pendingExists"));
      } else {
        setError(msg);
      }
    },
  });

  function handleClose() {
    setEmail("");
    setRole("viewer");
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    invite.mutate({ email, role });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogTitle>{t("invite.title")}</DialogTitle>

        {success ? (
          <p className="py-4 text-center text-body text-accent">
            {t("invite.success")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-small font-medium text-primary">
                {t("invite.emailLabel")}
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                />
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-small font-medium text-primary">
                {t("invite.roleLabel")}
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`role.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {error && <p className="text-small text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={invite.isPending}>
                {t("invite.submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
