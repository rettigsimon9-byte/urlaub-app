import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }

  const secret = process.env.APP_SECRET ?? 'fallback-secret';
  const token = createHmac('sha256', secret).update('authenticated').digest('hex');

  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
    path: '/',
  });
  return res;
}
