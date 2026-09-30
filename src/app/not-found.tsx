// Root-level 404. Root layout already provides <html><body>.
export default function NotFound() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">404 — Not Found</h1>
      <p className="mt-2 text-secondary">
        Try{" "}
        <a href="/zh" className="underline">
          /zh
        </a>{" "}
        or{" "}
        <a href="/en" className="underline">
          /en
        </a>
        .
      </p>
    </main>
  );
}
