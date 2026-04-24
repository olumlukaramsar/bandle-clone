import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    // Frontend'den gelen "Kaçıncı şarkıdayız?" (0, 1 veya 2) bilgisini al
    const { searchParams } = new URL(req.url);
    const indexParam = searchParams.get("index") || "0";
    const songIndex = parseInt(indexParam);

    // Bütün şarkıları her zaman aynı sabit sırayla çek (ID'ye göre dizili)
    const allSongs = await db.song.findMany({
      orderBy: { id: 'asc' },
      include: { stems: true }
    });

    if (allSongs.length === 0) {
      return NextResponse.json({ error: "Veritabanında şarkı yok" }, { status: 404 });
    }

    // Tarihe göre sabit bir numara üret (Böylece tüm dünyada aynı gün aynı numara çıkar)
    const today = new Date();
    // Saat farklarından etkilenmemek için Türkiye saat dilimine (UTC+3) göre günü alıyoruz
    const timeOffset = 3 * 60 * 60 * 1000; 
    const localTime = today.getTime() + timeOffset;
    const dayOfYear = Math.floor(localTime / (1000 * 60 * 60 * 24)); 

    // Günde 3 şarkı formülü:
    // 1. Gün: 0, 1, 2. şarkılar | 2. Gün: 3, 4, 5. şarkılar...
    const startIndex = (dayOfYear * 3) % allSongs.length;
    const targetIndex = (startIndex + songIndex) % allSongs.length;

    const dailySong = allSongs[targetIndex];

    return NextResponse.json(dailySong, { status: 200 });
  } catch (error) {
    console.error("Şarkı çekilirken hata:", error);
    return NextResponse.json({ error: "Şarkı getirilemedi" }, { status: 500 });
  }
}