import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Günlük puanları kullanıcı adına göre gruplayıp topluyoruz
    const scores = await db.dailyScore.groupBy({
      by: ['username'],
      _sum: {
        points: true,
      },
      orderBy: {
        _sum: {
          points: 'desc',
        },
      },
      take: 20, // İlk 20 kişi
    });

    // 2. Prisma'dan gelen karmaşık yapıyı (_sum.points) 
    // frontend'in beklediği temiz yapıya (points) çeviriyoruz.
    const formattedScores = scores.map((item) => ({
      username: item.username,
      points: item._sum.points || 0,
    }));

    return NextResponse.json(formattedScores, { status: 200 });
  } catch (error) {
    console.error("Liderlik tablosu çekilirken hata:", error);
    return NextResponse.json({ error: "Liderlik tablosu yüklenemedi" }, { status: 500 });
  }
}