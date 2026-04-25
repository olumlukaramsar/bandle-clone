import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

  try {
    // 1. Tarih Aralığını Belirle
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (dateParam === 'yesterday') {
      // Dünün başlangıcı ve bitişi
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // 2. Veritabanından Skorları Çek
    const leaderboard = await prisma.dailyScore.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: [
        { points: 'desc' },      // Önce en yüksek puan
        { createdAt: 'asc' },    // Puan eşitse önce yapan üste çıkar
      ],
      take: 50, // İlk 50 kişi
      select: {
        username: true,
        points: true,
      },
    });

    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error("Liderlik tablosu hatası:", error);
    return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
  }
}