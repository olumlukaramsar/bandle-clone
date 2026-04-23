"use client";

import { useState, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';

export default function Home() {
  const [guessInput, setGuessInput] = useState('');
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

  // --- SESLERİ BAŞLATAN FONKSİYON ---
  const playAllStems = (activeList: string[]) => {
    if (!engineRef.current) return;
    const { ctx, buffers, sources, gains } = engineRef.current;

    // Eski kaynakları temizle
    sources.forEach((source) => {
      try { source.stop(); } catch (e) {}
    });
    sources.clear();

    allStemsOrder.forEach((stemName) => {
      const buffer = buffers.get(stemName);
      const gainNode = gains.get(stemName);
      
      if (buffer && gainNode) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        // Ses seviyesini ayarla
        gainNode.gain.value = activeList.includes(stemName) ? 1 : 0;
        
        source.connect(gainNode);
        source.start(0);
        sources.set(stemName, source);
      }
    });
  };

  // --- MOBİL UYUMLU BAŞLATMA ---
  const handleStartGame = async () => {
    try {
      // 1. MOBİL İÇİN KRİTİK: Context'i en tepede oluştur ve uyandır
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      // iPhone/Android kilidini açmak için zorla uyandırıyoruz
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 2. API'den veriyi çek
      const response = await fetch('/api/songs/random');
      const songData = await response.json();
      if (!songData || !songData.stems) return;

      startGame(songData, ['drums']);

      const buffersMap = new Map();
      const gainsMap = new Map();

      // 3. Ses dosyalarını indir
      for (const stem of songData.stems) {
        const res = await fetch(stem.audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffersMap.set(stem.type, audioBuffer);

        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainsMap.set(stem.type, gainNode);
      }

      engineRef.current = { 
        ctx, 
        gains: gainsMap, 
        buffers: buffersMap, 
        sources: new Map() 
      };

      // 4. Çalmaya başla
      playAllStems(['drums']);

    } catch (error) {
      console.error("Hata:", error);
      alert("Oyun başlatılamadı, lütfen sayfayı yenileyip tekrar deneyin.");
    }
  };

  const handleSkip = () => {
    const nextIndex = activeStems.length;
    if (nextIndex >= allStemsOrder.length) return;

    const nextStem = allStemsOrder[nextIndex];
    const newList = [...activeStems, nextStem];

    skipTurn();
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
          className="bg-green-500 hover:bg-green-600 text-black px-12 py-6 rounded-full font-bold text-2xl shadow-xl active:scale-95"
        >
          OYUNU BAŞLAT
        </button>
      ) : (
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-between gap-2">
            {allStemsOrder.map((stem) => (
              <div 
                key={stem} 
                className={`flex-1 h-3 rounded-full transition-all ${
                  activeStems.includes(stem) ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-neutral-700'
                }`}
              />
            ))}
          </div>

          <div className="bg-neutral-800 p-8 rounded-3xl shadow-2xl border border-neutral-700">
            {gameStatus === 'won' ? (
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-black text-green-400">BİLDİN! 🎉</h2>
                <p className="text-xl">{currentSong?.artist} - {currentSong?.title}</p>
              </div>
            ) : (
              <form onSubmit={handleGuess} className="space-y-4">
                <input 
                  type="text"
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Şarkı adı..."
                  className="w-full bg-neutral-900 border border-neutral-700 p-4 rounded-xl text-white outline-none focus:border-green-500"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-white text-black font-bold p-4 rounded-xl">Tahmin</button>
                  <button 
                    type="button" 
                    onClick={handleSkip}
                    className="flex-1 bg-neutral-700 text-white font-bold p-4 rounded-xl"
                  >
                    Geç (+1)
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