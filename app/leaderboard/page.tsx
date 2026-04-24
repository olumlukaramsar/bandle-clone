import { db } from "@/lib/db";
import Link from "next/link";

// Sayfanın her seferinde veritabanından güncel veriyi çekmesini sağlar
export const revalidate = 0;

export default async function LeaderboardPage() {
  // Bugünün tarihini (saat 00:00:00) alıyoruz
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Veritabanından bugünkü skorları çekiyoruz
  const scores = await db.dailyScore.findMany({
    where: {
      createdAt: {
        gte: today, // Bugün veya bugünden sonra oluşturulanlar
      },
    },
    orderBy: {
      points: "desc", // En yüksek puan en üstte
    },
    take: 20, // Sadece ilk 20 kişiyi göster
  });

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 flex flex-col items-center py-12">
      <div className="w-full max-w-md">
        {/* Başlık Bölümü */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-purple-400 tracking-tighter mb-2">Hile yapan mallar hariç günün liderleri</h1>
          <p className="text-neutral-400 text-sm italic">Her gün saat 00:00'da sıfırlanır, unutmazsam.</p>
        </div>

        {/* Tablo Konteynırı */}
        <div className="bg-neutral-800 rounded-3xl border border-neutral-700 shadow-2xl overflow-hidden">
          {scores.length > 0 ? (
            <div className="divide-y divide-neutral-700">
              {scores.map((score, index) => (
                <div 
                  key={score.id} 
                  className={`flex items-center justify-between p-5 transition-colors ${
                    index === 0 ? 'bg-purple-500/5' : 'hover:bg-neutral-700/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Sıralama Numarası */}
                    <span className={`text-xl font-black w-6 ${
                      index === 0 ? 'text-yellow-400' : 
                      index === 1 ? 'text-neutral-300' : 
                      index === 2 ? 'text-orange-400' : 'text-neutral-500'
                    }`}>
                      {index + 1}
                    </span>
                    {/* İsim */}
                    <span className="font-bold text-lg">{score.username}</span>
                  </div>
                  
                  {/* Puan */}
                  <div className="text-right">
                    <span className="text-2xl font-black text-purple-400">{score.points}</span>
                    <span className="text-[10px] block text-neutral-500 uppercase font-bold tracking-widest">Puan</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">💤</div>
              <p className="text-neutral-400 font-medium">Kimse oynamamış demek ki modası geçti.</p>
              <p className="text-neutral-500 text-sm">Oyunu oynamadan niye buraya giriyon</p>
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="mt-8 flex flex-col gap-3">
          <Link 
            href="/"
            className="w-full bg-white text-black text-center py-4 rounded-2xl font-bold hover:bg-neutral-200 transition-all active:scale-95"
          >
            Geri Dön ve Oyna
          </Link>
          <p className="text-center text-[10px] text-neutral-600 uppercase tracking-[0.2em] font-bold">
            Dostlar Gazinosu • 2026
          </p>
        </div>
      </div>
    </div>
  );
}