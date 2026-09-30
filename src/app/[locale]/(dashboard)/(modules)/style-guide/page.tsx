import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { Boxes, Wallet, ShieldCheck, AlertTriangle } from "lucide-react";

export default async function StyleGuidePage() {
  const ctx = await getSessionContext();
  if (!ctx || ctx.role !== "admin") redirect({ href: "/", locale: "en" });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-display">Style Guide</h1>
        <p className="text-secondary text-small">
          Admin-only. Manual review of all primitives × variants.
        </p>
      </header>

      <section>
        <h2 className="text-h2 mb-3">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
            <div key={v} className="flex flex-col gap-2">
              <Button variant={v} size="sm">
                {v} sm
              </Button>
              <Button variant={v} size="md">
                {v} md
              </Button>
              <Button variant={v} size="lg">
                {v} lg
              </Button>
              <Button variant={v} disabled>
                disabled
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-h2 mb-3">Inputs</h2>
        <div className="grid max-w-md gap-3">
          <Input placeholder="Default" />
          <Input placeholder="Invalid" invalid />
          <Input placeholder="Disabled" disabled />
          <Textarea rows={3} placeholder="Multi-line" />
        </div>
      </section>

      <section>
        <h2 className="text-h2 mb-3">Badges</h2>
        <div className="flex flex-wrap gap-3">
          {(
            [
              "neutral",
              "info",
              "success",
              "warn",
              "danger",
              "critical",
            ] as const
          ).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-h2 mb-3">Cards</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
          </CardHeader>
          <CardBody>Body content.</CardBody>
        </Card>
      </section>

      <section>
        <h2 className="text-h2 mb-3">Icons (size scale)</h2>
        <div className="flex items-end gap-4">
          {[14, 16, 20, 24, 32, 48].map((s) => (
            <Icon
              key={s}
              icon={Boxes}
              size={s as 14 | 16 | 20 | 24 | 32 | 48}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <Icon icon={Wallet} />
          <Icon icon={ShieldCheck} />
          <Icon icon={AlertTriangle} />
        </div>
      </section>

      <section>
        <h2 className="text-h2 mb-3">Skeletons</h2>
        <div className="space-y-2 max-w-md">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>
    </div>
  );
}
