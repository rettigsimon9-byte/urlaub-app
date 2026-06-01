import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { tripId, imageData, thumbnail, photoDate, note, placeName, placeType, placeOrt, placeInfo } =
    await req.json();
  const photo = await prisma.photo.create({
    data: {
      tripId,
      imageData,
      thumbnail,
      photoDate: photoDate || null,
      note: note || '',
      placeName: placeName || '',
      placeType: placeType || '',
      placeOrt: placeOrt || '',
      placeInfo: placeInfo || '',
    },
  });

  // Set cover photo if this is the first photo
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (trip && !trip.coverPhoto) {
    await prisma.trip.update({ where: { id: tripId }, data: { coverPhoto: thumbnail } });
  }

  return NextResponse.json(photo);
}
