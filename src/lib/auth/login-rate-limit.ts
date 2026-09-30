import { CredentialsSignin } from "next-auth";
import { hashIp } from "@/lib/external-reports/anti-abuse";
import {
  loginEmailRateLimiter,
  loginIpRateLimiter,
} from "@/lib/rate-limit/tokenBucket";

/**
 * Thrown from the Credentials `authorize` callback when a sign-in attempt is
 * throttled. Auth.js puts `code` in the redirect URL, so the login form can
 * tell "too many attempts" apart from "wrong password".
 */
export class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/**
 * Consumes one attempt from both the per-IP and the per-account bucket.
 * Both are always consumed (no short-circuit) so an attacker can't probe one
 * bucket without spending from the other. Returns true when the attempt may
 * proceed.
 *
 * The per-IP key trusts `x-forwarded-for`, which is only meaningful behind a
 * reverse proxy that sets it; the per-account bucket bounds guessing either way.
 */
export async function consumeLoginAttempt(
  email: string,
  request: Request | undefined,
): Promise<boolean> {
  const ip = request?.headers.get("x-forwarded-for");
  const [byIp, byEmail] = await Promise.all([
    loginIpRateLimiter.consumeByKeyAsync(hashIp(ip)),
    loginEmailRateLimiter.consumeByKeyAsync(hashIp(`email:${email}`)),
  ]);
  return byIp.allowed && byEmail.allowed;
}
