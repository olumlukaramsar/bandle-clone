import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import JSZip from 'jszip';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const title = formData.get('title') as string;
    const artist = formData.get('artist') as string;
    const youtubeId = formData.get('youtubeId') as string;
    const file = formData.get('file') as File;

    if (!file || !title) {
      return NextResponse.json({ error: 'Eksik bilgiler var' }, { status: 400 });
    }

    // 1. Şarkıyı oluştur
    const song = await prisma.song.create({
      data: { 
        title, 
        artist, 
        youtubeId,
        thumbnailUrl: youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null
      }
    });

    // 2. ZIP dosyasını oku
    const arrayBuffer = await file.arrayBuffer();
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(arrayBuffer);
    
    const allFileNames = Object.keys(loadedZip.files);
    console.log("ZIP İçindeki Dosyalar:", allFileNames);

    // 3. Eşleştirme kuralları
    const stemMapping = [
      { key: 'drums', search: ['drums', 'drum'] },
      { key: 'bass', search: ['bass'] },
      { key: 'synth', search: ['synth', 'instrumental', 'other', 'piano', 'guitar'] },
      { key: 'vocals', search: ['vocals', 'vocal', 'voice'] },
      { key: 'full', search: ['full', 'original', 'mix'] }
    ];

    // 4. Dosyaları bul ve yükle
    for (let i = 0; i < stemMapping.length; i++) {
      const target = stemMapping[i];
      
      // Esnek arama: İsmin içinde 'drums' geçiyor mu ve müzik dosyası mı?
      const foundFileName = allFileNames.find(name => {
        const lowerName = name.toLowerCase();
        return target.search.some(s => lowerName.includes(s)) && 
               (lowerName.endsWith('.mp3') || lowerName.endsWith('.wav') || lowerName.endsWith('.m4a'));
      });

      if (foundFileName) {
        console.log(`Bulundu: ${target.key} -> ${foundFileName}`);
        const zipFile = loadedZip.file(foundFileName);
        
        if (zipFile) {
          const content = await zipFile.async('nodebuffer');
          
          // Vercel Blob'a yükle
          const blob = await put(`songs/${song.id}/${target.key}.mp3`, content, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN
          });

          // DB'ye kaydet
          await prisma.stem.create({
            data: {
              songId: song.id,
              type: target.key,
              order: i + 1,
              audioUrl: blob.url
            }
          });
        }
      } else {
        console.warn(`UYARI: ${target.key} için dosya bulunamadı.`);
      }
    }

    return NextResponse.json({ success: true, songId: song.id });
  } catch (error: any) {
    console.error("Yükleme Hatası Detayı:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}