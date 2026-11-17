import Link from "next/link";
import { signOut } from "./actions";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/exercises", label: "Exercises" },
  { href: "/routines", label: "Routines" },
  { href: "/bodyweight", label: "Bodyweight" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b px-4 py-3 sm:px-6">
        <span className="font-semibold">FitLogger</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
