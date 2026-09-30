"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { InviteMemberDialog } from "./InviteMemberDialog";

export function MembersPageActions() {
  const t = useTranslations("members");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={14} className="mr-1" />
        {t("invite.button")}
      </Button>
      <InviteMemberDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
