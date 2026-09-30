import { NextResponse } from "next/server";
import { isTestMode, getLatestForEmail } from "@/lib/notification/test-outbox";

export const runtime = "nodejs";

// Pulls the accept-invite URL (and its raw token) out of the email body.
// Body shape (from members.invite): "...Accept the invite: <URL>\n\n...".
function parseInviteUrl(body: string): {
  url: string | null;
  token: string | null;
} {
  const m = body.match(/(\S*\/accept-invite\?token=(\S+))/);
  if (!m) return { url: null, token: null };
  const url = m[1];
  let token: string;
  try {
    token = decodeURIComponent(m[2]);
  } catch {
    token = m[2];
  }
  return { url, token };
}

export async function GET(req: Request) {
  if (!isTestMode()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const email = new URL(req.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { error: "email query param required" },
      { status: 400 },
    );
  }
  const msg = getLatestForEmail(email);
  if (!msg) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { url, token } = parseInviteUrl(msg.body);
  return NextResponse.json({
    to: msg.to,
    subject: msg.subject,
    body: msg.body,
    url,
    token,
  });
}
