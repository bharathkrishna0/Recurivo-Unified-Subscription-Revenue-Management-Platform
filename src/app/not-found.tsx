import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-3 px-4">
      <h1 className="text-title font-semibold">Page not found</h1>
      <p className="text-ink-muted">The page does not exist, or you do not have access to it.</p>
      <Link href="/" className="font-semibold underline underline-offset-4 hover:no-underline">
        Go to your home page
      </Link>
    </main>
  );
}
