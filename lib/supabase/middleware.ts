import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Route groups like (app) and (auth) are organizational only — they don't
// appear in the actual URL — so redirect decisions match on real pathnames.
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/workout",
  "/exercises",
  "/routines",
  "/bodyweight",
  "/settings",
];
const AUTH_ROUTES = ["/sign-in", "/sign-up"];

/**
 * Refreshes the Supabase session cookie on every request and redirects based
 * on auth state: signed-out users get bounced off protected app routes to
 * /sign-in; signed-in users get bounced off the auth routes to /dashboard.
 * The landing page ("/") is intentionally left ungated either way.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser() — per
  // Supabase's guidance, that gap is where session-refresh bugs creep in
  // (users getting randomly logged out).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAppRoute = APP_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (!user && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
