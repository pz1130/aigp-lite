"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

type Tab = "all" | "unread";
type NotificationTranslator = (
  key: string,
  values: Record<string, string>,
) => string;

function formatTime(d: Date | string) {
  const t = typeof d === "string" ? new Date(d) : d;
  return t.toLocaleString();
}

export function NotificationsPageClient() {
  const t = useTranslations("notifications");
  const translateNotification = t as unknown as NotificationTranslator;
  const router = useRouter();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("all");

  const query = trpc.notification.list.useInfiniteQuery(
    { limit: 20, unreadOnly: tab === "unread" },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAll = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            variant={tab === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("all")}
          >
            {t("tabAll")}
          </Button>
          <Button
            variant={tab === "unread" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("unread")}
          >
            {t("tabUnread")}
          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          {t("markAllRead")}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={t("empty")}
          description={t("emptyHint")}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th className="w-10"></Th>
              <Th>{t("title")}</Th>
              <Th className="w-48">Time</Th>
              <Th className="w-24"></Th>
            </Tr>
          </THead>
          <TBody>
            {items.map((n) => {
              const unread = !n.readAt;
              return (
                <Tr key={n.id}>
                  <Td>
                    {unread && (
                      <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                    )}
                  </Td>
                  <Td>
                    <div className={unread ? "font-medium" : ""}>
                      {translateNotification(
                        n.titleKey,
                        n.paramsJson as Record<string, string>,
                      )}
                    </div>
                    <div className="text-xs text-tertiary mt-0.5">
                      {translateNotification(
                        n.bodyKey,
                        n.paramsJson as Record<string, string>,
                      )}
                    </div>
                  </Td>
                  <Td className="text-xs text-tertiary">
                    {formatTime(n.createdAt)}
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent hover:underline"
                      onClick={() => {
                        if (unread) markRead.mutate({ id: n.id });
                        router.push(n.linkHref);
                      }}
                    >
                      Open
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      {query.hasNextPage && (
        <div className="text-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
