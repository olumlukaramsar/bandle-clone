import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Tarihi (YYYY-MM-DD) deterministik bir tam sayıya dönüştürür.
function dateToSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Seeded LCG (Linear Congruential Generator) — tekrarlanabilir rastgelelik sağlar.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Fisher-Yates shuffle — aynı seed ile her zaman aynı sırayı üretir.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rand = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const indexParam = searchParams.get("index") || "0";
    const songIndex = parseInt(indexParam);

    // Frontend'den gelen tarih parametresi (YYYY-MM-DD). Yoksa sunucu UTC+3 saatine göre hesaplar.
    let dateStr = searchParams.get("date") || "";
    if (!dateStr) {
      const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // UTC+3
      dateStr = now.toISOString().slice(0, 10);
    }

    // Tüm şarkıları ID sırasına göre çekiyoruz (sabit temel sıra).
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const allSongs = await db.song.findMany({
      orderBy: { id: 'asc' },
      include: { stems: true }
    });

    if (allSongs.length === 0) {
      return NextResponse.json({ error: "Veritabanında şarkı yok" }, { status: 404 });
    }

    // Tarihi seed'e çevir ve şarkıları o güne özgü sabit bir sıraya diz.
    // Yeni şarkı eklenmesi geçmiş günlerin sırasını etkilemez.
    const seed = dateToSeed(dateStr);
    const shuffled = seededShuffle(allSongs, seed);

    // Havuz turu: toplam şarkı sayısını mod alarak döngüsel ilerleme sağla.
    const targetIndex = songIndex % shuffled.length;
    const dailySong = shuffled[targetIndex];

    // BigInt değerlerini Number'a güvenli şekilde dönüştür.
    const safeSongData = JSON.parse(
      JSON.stringify(dailySong, (_key, value) =>
        typeof value === 'bigint' ? Number(value) : value
      )
    );

    return NextResponse.json(safeSongData, { status: 200 });
  } catch (error) {
    console.error("Şarkı çekilirken hata:", error);
    return NextResponse.json({ error: "Şarkı getirilemedi" }, { status: 500 });
  }
}