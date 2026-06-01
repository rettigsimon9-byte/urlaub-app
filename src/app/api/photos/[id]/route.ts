import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const photo = await prisma.photo.update({ where: { id: params.id }, data });
  return NextResponse.json(photo);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.photo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
