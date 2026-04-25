import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import JSZip from "jszip";

// Stem sırası ve tipi
const STEM_ORDER: Record<string, number> = {
  drums: 1,
  bass: 2,
  synth: 3,
  vocals: 4,
  full: 5,
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    // Form verilerini al
    const title = formData.get("title") as string;
    const artist = formData.get("artist") as string;
    const difficultyStr = formData.get("difficulty") as string;
    const releaseYearStr = formData.get("releaseYear") as string;
    const viewCountStr = formData.get("viewCount") as string;
    const file = formData.get("file") as File;

    if (!title || !artist || !file) {
      return NextResponse.json(
        { error: "title, artist ve ZIP dosyası zorunludur." },
        { status: 400 }
      );
    }

    // ZIP dosyasını oku ve aç
    const zipBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuffer);

    // Her stem için Vercel Blob'a yükle
    const stemCreates: { type: string; order: number; audioUrl: string }[] = [];

    for (const [stemType, order] of Object.entries(STEM_ORDER)) {
      const fileName = `${stemType}.mp3`;
      const zipEntry = zip.file(fileName);

      if (!zipEntry) {
        return NextResponse.json(
          { error: `ZIP içinde '${fileName}' bulunamadı.` },
          { status: 400 }
        );
      }

      const stemBuffer = await zipEntry.async("arraybuffer");
      const stemBlob = new Blob([stemBuffer], { type: "audio/mpeg" });

      // Vercel Blob'a yükle — benzersiz path
      const blobPath = `songs/${title
        .toLowerCase()
        .replace(/\s+/g, "-")}-${Date.now()}/${fileName}`;

      const { url } = await put(blobPath, stemBlob, {
        access: "public",
        contentType: "audio/mpeg",
      });

      stemCreates.push({ type: stemType, order, audioUrl: url });
    }

    // Prisma'ya kaydet
    const songData: any = {
      title,
      artist,
      difficulty: difficultyStr ? parseInt(difficultyStr) : 3,
    };

    if (releaseYearStr && releaseYearStr !== "") {
      songData.releaseYear = parseInt(releaseYearStr);
    }

    if (viewCountStr && viewCountStr !== "") {
      songData.viewCount = BigInt(viewCountStr);
    }

    const newSong = await prisma.song.create({
      data: {
        ...songData,
        stems: {
          create: stemCreates,
        },
      },
      include: {
        stems: true,
      },
    });

    // BigInt serialize
    const serialized = JSON.parse(
      JSON.stringify(newSong, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("Yükleme hatası:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
