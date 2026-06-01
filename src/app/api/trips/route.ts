import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const trips = await prisma.trip.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { photos: true } } },
  });
  return NextResponse.json(trips);
}

export async function POST(req: NextRequest) {
  const { name, destination, startDate, endDate } = await req.json();
  const trip = await prisma.trip.create({
    data: { name, destination, startDate: startDate || null, endDate: endDate || null },
  });
  return NextResponse.json(trip);
}
