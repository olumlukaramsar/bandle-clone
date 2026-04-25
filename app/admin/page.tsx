"use client";

import { useState } from 'react';
import { Upload, Music, User, Loader2, Star, Calendar } from 'lucide-react';

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  // Yeni Alanlar
  const [difficulty, setDifficulty] = useState('3');
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear().toString());
  const [viewCount, setViewCount] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !artist || !releaseYear || !viewCount) {
      setMessage('Lütfen tüm alanları doldurun ve bir ZIP dosyası seçin.');
      return;
    }

    setLoading(true);
    setMessage('Yükleniyor ve işleniyor... Lütfen bekleyin.');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('artist', artist);
    // Yeni Verileri Ekleme
    formData.append('difficulty', String(Number(difficulty)));
    formData.append('releaseYear', String(Number(releaseYear))); 
    formData.append('viewCount', String(Number(viewCount)));

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Şarkı ve tüm verileri başarıyla yüklendi!');
        setFile(null);
        setTitle('');
        setArtist('');
        setViewCount('');
      } else {
        setMessage(`❌ Hata: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      setMessage('Sunucuya bağlanırken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black mb-8 text-green-400 border-b border-neutral-700 pb-4">
          Admin Paneli: Şarkı Yükle
        </h1>

        <form onSubmit={handleUpload} className="bg-neutral-800 p-6 rounded-2xl shadow-xl flex flex-col gap-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Şarkı Adı */}
            <div>
              <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
                <Music size={16} /> Şarkı Adı
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: Söyle Canım"
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                required
              />
            </div>

            {/* Sanatçı Adı */}
            <div>
              <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
                <User size={16} /> Sanatçı Adı
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Örn: Erol Evgin"
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Zorluk */}
            <div>
              <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
                <Star size={16} /> Zorluk (1-5)
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
              >
                {[1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num}>{num} {num === 1 ? '(Kolay)' : num === 5 ? '(Zor)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Yıl */}
            <div>
              <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
                <Calendar size={16} /> Çıkış Yılı
              </label>
              <input
                type="number"
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                required
              />
            </div>

            {/* YouTube İzlenme */}
            <div>
              <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
                 YouTube İzlenme
              </label>
              <input
                type="number"
                value={viewCount}
                onChange={(e) => setViewCount(e.target.value)}
                placeholder="Örn: 8800000"
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Dosya Yükleme Alanı */}
          <div>
            <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
              <Upload size={16} /> ZIP Dosyası Yükle
            </label>
            <div className="relative w-full h-32 border-2 border-dashed border-neutral-600 rounded-lg flex items-center justify-center hover:border-green-500 transition-colors bg-neutral-900 cursor-pointer">
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                required
              />
              <div className="text-center">
                {file ? (
                  <span className="text-green-400 font-bold">{file.name}</span>
                ) : (
                  <span className="text-neutral-500">Sürükle bırak veya bir ZIP seç</span>
                )}
              </div>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-lg font-medium text-center ${message.includes('❌') || message.includes('Lütfen') ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                İşleniyor...
              </>
            ) : (
              'Şarkıyı ve Verileri Kaydet'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}