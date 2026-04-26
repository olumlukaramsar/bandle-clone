import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

  try {
    // UTC bazlı — sunucu timezone'undan bağımsız
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let startDate: Date;
    let endDate: Date;

    if (dateParam === 'yesterday') {
      // "yesterday" string'i — dünü getir
      startDate = new Date(todayUTC.getTime() - 86_400_000);
      endDate = todayUTC;
    } else if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      // "2026-04-26" formatında tarih — o günü getir
      startDate = new Date(`${dateParam}T00:00:00.000Z`);
      endDate = new Date(startDate.getTime() + 86_400_000);
    } else {
      // Parametre yoksa bugünü getir
      startDate = todayUTC;
      endDate = new Date(todayUTC.getTime() + 86_400_000);
    }

    const leaderboard = await prisma.dailyScore.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: [
        { points: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 50,
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