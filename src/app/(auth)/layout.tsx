import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-12">
      <Link href="/" className="mb-12 text-[20px] font-bold tracking-[-0.02em]">
        Recurivo<span aria-hidden="true">.</span>
      </Link>
      <main id="main" className="w-full max-w-[400px]">
        {children}
      </main>
    </div>
  );
}
