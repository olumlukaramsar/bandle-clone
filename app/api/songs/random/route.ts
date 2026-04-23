import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Toplam şarkı sayısını al
    const count = await prisma.song.count();
    const skip = Math.floor(Math.random() * count);
    
    // Rastgele birini seç ve katmanlarıyla birlikte getir
    const song = await prisma.song.findFirst({
      skip: skip,
      include: { stems: true }
    });

    return NextResponse.json(song);
  } catch (error) {
    return NextResponse.json({ error: 'Şarkı alınamadı' }, { status: 500 });
  }
}