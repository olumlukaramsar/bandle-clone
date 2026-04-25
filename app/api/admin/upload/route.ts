import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
// ... diğer importların (put, unzip vb.)

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // Temel verileri al
    const title = formData.get('title') as string;
    const artist = formData.get('artist') as string;
    
    // Formdan gelen yeni verileri al
    const difficultyStr = formData.get('difficulty') as string;
    const releaseYearStr = formData.get('releaseYear') as string;
    const viewCountStr = formData.get('viewCount') as string;
    const youtubeId = formData.get('youtubeId') as string; // Formda varsa
    const thumbnailUrl = formData.get('thumbnailUrl') as string; // Formda varsa

    // 1. Dinamik bir data objesi oluşturuyoruz
    // Sadece zorunlu olanları en başta ekliyoruz
    const songCreateData: any = {
      title,
      artist,
      difficulty: difficultyStr ? parseInt(difficultyStr) : 3, // Boşsa varsayılan 3
    };

    // 2. Sadece DOLU olan (null olmayan) alanları objeye ekliyoruz
    if (releaseYearStr && releaseYearStr !== "") {
      songCreateData.releaseYear = parseInt(releaseYearStr);
    }

    if (viewCountStr && viewCountStr !== "") {
      // BigInt hatasını önlemek için string'den BigInt'e çeviriyoruz
      songCreateData.viewCount = BigInt(viewCountStr);
    }

    if (youtubeId && youtubeId !== "") {
      songCreateData.youtubeId = youtubeId;
    }

    if (thumbnailUrl && thumbnailUrl !== "") {
      songCreateData.thumbnailUrl = thumbnailUrl;
    }

    // ... Dosya yükleme ve ZIP açma işlemlerin bittikten sonra ...
    // Prisma Create kısmını şu şekilde kullan:

    const newSong = await prisma.song.create({
      data: {
        ...songCreateData, // Hazırladığımız dolu verileri buraya yayıyoruz
        stems: {
          create: [
            // ... daha önceki stem (drums, bass vb.) yükleme kodların ...
          ]
        }
      }
    });

    return NextResponse.json(newSong);

  } catch (error: any) {
    console.error("Yükleme hatası:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}