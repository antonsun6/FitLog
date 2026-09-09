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
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">FitLogger</span>
        <nav className="flex items-center gap-4 text-sm">
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
