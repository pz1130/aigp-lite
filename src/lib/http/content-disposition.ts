/**
 * Builds an RFC 6266-compliant `Content-Disposition` value for a file download.
 *
 * Filenames built from user data (e.g. a usecase name) may contain non-ASCII
 * characters or quotes, which are invalid in the bare `filename="..."` form and
 * get mangled by some browsers. We emit both:
 *   - `filename="<ascii>"` — a sanitized ASCII fallback for older clients, and
 *   - `filename*=UTF-8''<percent-encoded>` — the precise UTF-8 name, preferred
 *     by all modern browsers.
 */
export function attachmentDisposition(filename: string): string {
  // ASCII fallback: replace anything outside printable ASCII, plus quotes and
  // backslashes, with an underscore so the quoted form stays well-formed.
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
