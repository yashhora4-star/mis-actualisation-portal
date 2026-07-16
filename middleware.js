import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
    let response = NextResponse.next({ request });

  const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
            cookies: {
                      getAll() { return request.cookies.getAll(); },
                      setAll(cookiesToSet) {
                                  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                                  response = NextResponse.next({ request });
                                  cookiesToSet.forEach(({ name, value, options }) =>
                                                response.cookies.set(name, value, options)
                                                                 );
                      },
            },
    }
      );

  const { data: { user } } = await supabase.auth.getUser();
    const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith('/api');
    const isLogin = pathname === '/login';

  if (!user && !isLogin && !isApi) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
  }
    if (!user && isApi) {
          return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    if (user && isLogin) {
          const url = request.nextUrl.clone();
          url.pathname = '/dashboard';
          return NextResponse.redirect(url);
    }
    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
