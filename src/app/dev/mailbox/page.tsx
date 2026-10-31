import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Sandbox mailbox", robots: { index: false } };

/** Local-only view of emails captured by the sandbox transport. */
export default async function MailboxPage() {
  await connection();
  if (process.env.MAIL_TRANSPORT === "smtp" || process.env.NODE_ENV === "production") notFound();
  const emails = await db.sandboxEmail.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <main id="main" className="mx-auto max-w-[960px] px-4 py-10">
      <h1 className="text-title font-semibold">Sandbox mailbox</h1>
      <p className="mb-6 text-ink-muted">Emails the worker delivered with MAIL_TRANSPORT=sandbox. Newest first.</p>
      <ol className="divide-y divide-line border-y border-line">
        {emails.length === 0 ? <li className="py-6 text-ink-muted">No emails yet. Is the worker running?</li> : null}
        {emails.map((m) => (
          <li key={m.id} className="py-5">
            <p className="font-semibold">{m.subject}</p>
            <p className="text-small text-ink-muted">
              To {m.to} · {m.createdAt.toISOString()}
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-control bg-surface-subtle p-4 font-sans text-small">{m.text}</pre>
          </li>
        ))}
      </ol>
    </main>
  );
}
