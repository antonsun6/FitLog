import { signOut } from "./actions";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">FitLogger</span>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
