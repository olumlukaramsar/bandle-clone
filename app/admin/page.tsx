"use client";

import { useState } from 'react';
import { Upload, Music, User, Loader2 } from 'lucide-react';

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !artist) {
      setMessage('Lütfen tüm alanları doldurun ve bir ZIP dosyası seçin.');
      return;
    }

    setLoading(true);
    setMessage('Yükleniyor ve işleniyor... Lütfen bekleyin.');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('artist', artist);

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Şarkı ve katmanları başarıyla yüklendi!');
        setFile(null);
        setTitle('');
        setArtist('');
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
          
          {/* Şarkı Adı */}
          <div>
            <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
              <Music size={16} /> Şarkı Adı
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Bohemian Rhapsody"
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
              placeholder="Örn: Queen"
              className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-green-500 outline-none"
              required
            />
          </div>

          {/* Dosya Yükleme Alanı */}
          <div>
            <label className="block text-neutral-400 text-sm font-bold mb-2 flex items-center gap-2">
              <Upload size={16} /> ZIP Dosyası Yükle (İçinde 5 adet mp3 olmalı)
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
            <p className="text-xs text-neutral-500 mt-2">
              *ZIP dosyasının içinde isimleri tam olarak şöyle olan dosyalar olmalıdır: <br/>
              <code className="text-green-400 bg-neutral-900 px-1 rounded">drums.mp3</code>, 
              <code className="text-green-400 bg-neutral-900 px-1 rounded ml-1">bass.mp3</code>, 
              <code className="text-green-400 bg-neutral-900 px-1 rounded ml-1">synth.mp3</code>, 
              <code className="text-green-400 bg-neutral-900 px-1 rounded ml-1">vocals.mp3</code>, 
              <code className="text-green-400 bg-neutral-900 px-1 rounded ml-1">full.mp3</code>
            </p>
          </div>

          {/* Sistem Mesajları */}
          {message && (
            <div className={`p-4 rounded-lg font-medium text-center ${message.includes('❌') || message.includes('Lütfen') ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
              {message}
            </div>
          )}

          {/* Yükle Butonu */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                İşleniyor...
              </>
            ) : (
              'Sisteme Yükle'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}