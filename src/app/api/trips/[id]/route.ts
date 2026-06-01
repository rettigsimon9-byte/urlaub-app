import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const trip = await prisma.trip.findUnique({
    where: { id: params.id },
    include: { photos: { orderBy: [{ photoDate: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(trip);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const trip = await prisma.trip.update({ where: { id: params.id }, data });
  return NextResponse.json(trip);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.trip.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
