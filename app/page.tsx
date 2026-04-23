"use client";

import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';

export default function Home() {
  const [guessInput, setGuessInput] = useState('');
  // Ses motoru bileşenlerini useRef ile güvenli bir şekilde saklıyoruz
  const engineRef = useRef<{ 
    ctx: AudioContext; 
    gains: Map<string, GainNode>; 
    buffers: Map<string, AudioBuffer>;
    sources: Map<string, AudioBufferSourceNode>;
  } | null>(null);

  const { 
    activeStems, 
    gameStatus, 
    startGame, 
    submitGuess, 
    skipTurn, 
    currentSong 
  } = useGameStore();

  const allStemsOrder = ['drums', 'bass', 'synth', 'vocals', 'full'];

  // --- SESİ BAŞLATAN VE BAŞA SARAN ANA FONKSİYON ---
  const playAllStems = (activeList: string[]) => {
    if (!engineRef.current) return;
    const { ctx, buffers, sources, gains } = engineRef.current;

    // 1. Önce çalan tüm kaynakları durdur ve temizle
    sources.forEach((source) => {
      try { source.stop(); } catch (e) {}
    });
    sources.clear();

    // 2. Aktif listedeki enstrümanları 0. saniyeden tekrar oluştur
    allStemsOrder.forEach((stemName) => {
      const buffer = buffers.get(stemName);
      if (!buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = gains.get(stemName);
      if (gainNode) {
        // Eğer enstrüman aktif listedeyse sesini aç (1), değilse kapat (0)
        gainNode.gain.value = activeList.includes(stemName) ? 1 : 0;
        source.connect(gainNode);
        source.start(0); // Şarkıyı 0. saniyeden başlatır
        sources.set(stemName, source);
      }
    });
    
    console.log("Şarkı senkronize edildi ve baştan başlatıldı:", activeList);
  };

  // --- OYUNU İLK KEZ BAŞLATMA ---
  const handleStartGame = async () => {
    try {
      const response = await fetch('/api/songs/random');
      const songData = await response.json();
      if (!songData || !songData.stems) return;

      // Zustand Store'u başlat
      startGame(songData, ['drums']);

      // AudioContext'i oluştur (Kullanıcı etkileşimi anında!)
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') await ctx.resume();

      const buffersMap = new Map();
      const gainsMap = new Map();

      // Tüm enstrüman dosyalarını indir ve buffer'a al
      for (const stem of songData.stems) {
        const res = await fetch(stem.audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffersMap.set(stem.type, audioBuffer);

        // GainNode (Ses kontrolü) oluştur ve hoparlöre bağla
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainsMap.set(stem.type, gainNode);
      }

      // Motor referanslarını kaydet
      engineRef.current = { 
        ctx, 
        gains: gainsMap, 
        buffers: buffersMap, 
        sources: new Map() 
      };

      // İlk çalmayı başlat (Sadece davul)
      playAllStems(['drums']);

    } catch (error) {
      console.error("Başlatma hatası:", error);
    }
  };

  // --- GEÇ BUTONU ---
  const handleSkip = () => {
    // 1. Bir sonraki enstrümanın ne olacağını hesapla
    const nextIndex = activeStems.length;
    if (nextIndex >= allStemsOrder.length) return;

    const nextStem = allStemsOrder[nextIndex];
    const newList = [...activeStems, nextStem];

    // 2. Zustand state'i güncelle
    skipTurn();

    // 3. Sesleri yeni listeyle baştan başlat
    playAllStems(newList);
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    submitGuess(guessInput);
    setGuessInput('');
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-black mb-8 text-green-400 tracking-wider">BANDLE CLONE</h1>
      
      {gameStatus === 'idle' ? (
        <button 
          onClick={handleStartGame}
          className="bg-green-500 hover:bg-green-600 text-black px-12 py-6 rounded-full font-bold text-2xl shadow-xl transition-transform active:scale-95"
        >
          OYUNU BAŞLAT
        </button>
      ) : (
        <div className="w-full max-w-md space-y-6">
          {/* İlerleme Çubuğu */}
          <div className="flex justify-between gap-2">
            {allStemsOrder.map((stem) => (
              <div 
                key={stem} 
                className={`flex-1 h-3 rounded-full transition-colors duration-500 ${
                  activeStems.includes(stem) ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-neutral-700'
                }`}
              />
            ))}
          </div>

          <div className="bg-neutral-800 p-8 rounded-3xl shadow-2xl border border-neutral-700">
            {gameStatus === 'won' ? (
              <div className="text-center space-y-4 animate-bounce">
                <h2 className="text-3xl font-black text-green-400">TEBRİKLER! 🎉</h2>
                <p className="text-xl text-white">{currentSong?.artist} - {currentSong?.title}</p>
              </div>
            ) : (
              <form onSubmit={handleGuess} className="space-y-4">
                <input 
                  type="text"
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Şarkıyı tahmin et..."
                  className="w-full bg-neutral-900 border border-neutral-700 p-4 rounded-xl focus:outline-none focus:border-green-500 text-white"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-white text-black font-bold p-4 rounded-xl hover:bg-neutral-200 transition-colors">Tahmin Et</button>
                  <button 
                    type="button" 
                    onClick={handleSkip}
                    className="flex-1 bg-neutral-700 text-white font-bold p-4 rounded-xl hover:bg-neutral-600 transition-colors"
                  >
                    Geç (+1 Enstrüman)
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}