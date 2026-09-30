"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/components/ui/_utils/cn";

function timeAgo(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - t.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const _t = useTranslations("notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = trpc.notification.list.useQuery({ limit: 5 });
  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center w-7 h-7 rounded-md text-tertiary/60 hover:text-primary hover:bg-muted/70 transition-all"
          aria-label="Notifications"
        >
          <Bell size={14} strokeWidth={1.5} />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default/40">
          <span className="text-[13px] font-semibold text-primary">
            Notifications
          </span>
          {unread > 0 && (
            <span className="text-[11px] text-accent font-medium">
              {unread} new
            </span>
          )}
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <Bell
              size={20}
              className="mx-auto text-tertiary/40 mb-2"
              strokeWidth={1}
            />
            <p className="text-[12px] text-tertiary">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-border-default/40">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (n.linkHref) router.push(n.linkHref);
                }}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors",
                  !n.readAt && "bg-accent-subtle/30",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                      !n.readAt ? "bg-accent" : "bg-transparent",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-primary leading-snug">
                      {n.titleKey}
                    </p>
                    {n.bodyKey && (
                      <p className="text-[11px] text-secondary mt-0.5 leading-snug line-clamp-2">
                        {n.bodyKey}
                      </p>
                    )}
                    <span className="text-[10px] text-tertiary mt-1 block">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
