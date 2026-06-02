import { NextRequest, NextResponse } from 'next/server';

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  // Kein Passwort konfiguriert → kein Schutz (z.B. lokale Entwicklung)
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Login-Seite und Auth-API immer durchlassen
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const secret = process.env.APP_SECRET ?? 'fallback-secret';
  const token = request.cookies.get('session')?.value;

  if (token) {
    const expected = await hmac(secret, 'authenticated');
    if (token === expected) return NextResponse.next();
  }

  const url = new URL('/login', request.url);
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
