// lib/youtube.ts

export async function fetchYoutubeMetadata(title: string, artist: string) {
  // Eğer API key yoksa test amaçlı sahte veri dön (Geliştirme aşamasında çökmemesi için)
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn("YouTube API Key eksik. Sahte kapak fotoğrafı kullanılıyor.");
    return {
      videoId: "dQw4w9WgXcQ",
      thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500&auto=format&fit=crop",
      viewCount: 1000000
    };
  }

  try {
    const query = encodeURIComponent(`${artist} - ${title} official audio`);
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    // 1. Videoyu bul
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&key=${apiKey}&maxResults=1`
    );
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) return null;

    const videoId = data.items[0].id.videoId;
    
    // 2. İzlenme sayısını (ViewCount) al
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`
    );
    const statsData = await statsRes.json();

    return {
      videoId,
      thumbnail: data.items[0].snippet.thumbnails.high.url,
      viewCount: parseInt(statsData.items[0].statistics.viewCount)
    };
  } catch (error) {
    console.error("YouTube Fetch Hatası:", error);
    return null;
  }
}