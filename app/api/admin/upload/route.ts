// app/api/admin/upload/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import JSZip from 'jszip';
import prisma from '@/lib/prisma';
import { fetchYoutubeMetadata } from '@/lib/youtube';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File; // Adminin yükleyeceği ZIP dosyası
    const title = formData.get('title') as string;
    const artist = formData.get('artist') as string;

    if (!file || !title || !artist) {
      return NextResponse.json({ error: 'Eksik bilgi gönderildi.' }, { status: 400 });
    }

    // 1. YouTube'dan kapak fotoğrafını çek
    const ytData = await fetchYoutubeMetadata(title, artist);

    // 2. Şarkıyı Veritabanına (Neon'a) kaydet
    const song = await prisma.song.create({
      data: {
        title,
        artist,
        youtubeId: ytData?.videoId,
        thumbnailUrl: ytData?.thumbnail,
        viewCount: ytData?.viewCount,
      }
    });

    // 3. ZIP Dosyasını Bellekte Aç
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(await file.arrayBuffer());
    
    // 4. İçindeki 5 katmanı bul, Vercel Blob'a yükle ve veritabanına URL'lerini kaydet
    const stemTypes = ['drums', 'bass', 'synth', 'vocals', 'full'];
    
    for (let i = 0; i < stemTypes.length; i++) {
      const type = stemTypes[i];
      // ZIP'in içinde 'drums.mp3' gibi bir dosya arıyoruz
      const zipFile = loadedZip.file(`${type}.mp3`) || loadedZip.file(`${type}.m4a`); 
      
      if (zipFile) {
        const buffer = await zipFile.async('nodebuffer');
        
        // Vercel Blob Bulutuna Yükle (Eğer Blob tokenin yoksa burası hata verebilir, onu çözeceğiz)
        const blob = await put(`songs/${song.id}/${type}.mp3`, buffer, { 
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN // .env dosyasından alacak
        });
        
        // Veritabanına Sesin URL'sini kaydet
        await prisma.stem.create({
          data: {
            songId: song.id,
            type: type,
            order: i + 1, // 1'den 5'e kadar sıralama
            audioUrl: blob.url
          }
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Şarkı başarıyla eklendi!', songId: song.id });

  } catch (error) {
    console.error("Yükleme sırasında kritik hata:", error);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}