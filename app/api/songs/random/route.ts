import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const indexParam = searchParams.get("index") || "0";
    const songIndex = parseInt(indexParam);

    // Tüm şarkıları ID sırasına göre çekiyoruz
    const allSongs = await db.song.findMany({
      orderBy: { id: 'asc' },
      include: { stems: true }
    });

    if (allSongs.length === 0) {
      return NextResponse.json({ error: "Veritabanında şarkı yok" }, { status: 404 });
    }

    // Tarihe göre sabit bir sayı üret (Günlük değişir)
    const today = new Date();
    const timeOffset = 3 * 60 * 60 * 1000; // Türkiye Saati (UTC+3)
    const localTime = today.getTime() + timeOffset;
    const dayOfYear = Math.floor(localTime / (1000 * 60 * 60 * 24)); 

    // Her gün için 3 şarkılık bir "pencere" seçiyoruz
    // 1. Gün: 0,1,2 | 2. Gün: 3,4,5 ... şeklinde ilerler, liste bitince başa döner.
    const startIndex = (dayOfYear * 3) % allSongs.length;
    const targetIndex = (startIndex + songIndex) % allSongs.length;

    const dailySong = allSongs[targetIndex];

    return NextResponse.json(dailySong, { status: 200 });
  } catch (error) {
    console.error("Şarkı çekilirken hata:", error);
    return NextResponse.json({ error: "Şarkı getirilemedi" }, { status: 500 });
  }
}