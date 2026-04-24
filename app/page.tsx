"use client";

import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';

// Aşama isimlerini Türkçeleştirmek için sözlük
const stageNames: Record<string, string> = {
  drums: 'Bateri',
  bass: 'Bass Gitar',
  synth: 'Klavye / Synth',
  vocals: 'Vokal',
  full: 'Full Versiyon'
};

export default function Home() {
  // --- STATELER ---
  const [username, setUsername] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(true); // YENİ: Sayfa ilk açıldığında giriş kontrolü yapar
  
  // 3 Şarkılık Günlük Hak Sistemi
  const [tamamlananSarkiSayisi, setTamamlananSarkiSayisi] = useState(0);
  const [gunlukLimitAsildi, setGunlukLimitAsildi] = useState(false);

  // --- SAYFA YÜKLENDİĞİNDE: İsim ve Şarkı Hakkı Kontrolü ---
  useEffect(() => {
    // 1. İsim Kaydı Kontrolü (Tekrar giriş yapmayı engeller)
    const savedName = localStorage.getItem("bandle_username");
    if (savedName) {
      setUsername(savedName);
      setIsStarted(true); // İsmi varsa direkt içeri al
    }

    // 2. Günlük Limit Kontrolü
    const today = new Date().toLocaleDateString();
    const savedDaily = localStorage.getItem("bandle_daily_v2");

    if (savedDaily) {
      const parsed = JSON.parse(savedDaily);
      if (parsed.date === today) {
        setTamamlananSarkiSayisi(parsed.count);
        if (parsed.count >= 5) setGunlukLimitAsildi(true);
      } else {
        localStorage.setItem("bandle_daily_v2", JSON.stringify({ date: today, count: 0 }));
        setTamamlananSarkiSayisi(0);
      }
    } else {
      localStorage.setItem("bandle_daily_v2", JSON.stringify({ date: today, count: 0 }));
    }

    setIsChecking(false); // Kontroller bitti, ekranı göster
  }, []);

  const handleLoginSubmit = () => {
    if (username.trim().length < 2) {
      alert("Lütfen en az 2 karakterli bir isim gir!");
      return;
    }
    localStorage.setItem("bandle_username", username);
    setIsStarted(true);
  };

  const puanKaydet = async (alinanPuan: number) => {
    setIsSaving(true);
    try {
      await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, points: alinanPuan }),
      });
      
      const yeniSayi = tamamlananSarkiSayisi + 1;
      setTamamlananSarkiSayisi(yeniSayi);
      const today = new Date().toLocaleDateString();
      localStorage.setItem("bandle_daily_v2", JSON.stringify({ date: today, count: yeniSayi }));

      if (yeniSayi >= 5) {
        setGunlukLimitAsildi(true);
      } else {
        alert(`Tebrikler! ${alinanPuan} puan kazandın. Sırada ${5 - yeniSayi} şarkı hakkın kaldı.`);
        window.location.reload(); 
      }
    } catch (error) {
      console.error("Puan hatası:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // --- OYUN MOTORU ---
  const [guessInput, setGuessInput] = useState('');
  const engineRef = useRef<{ 
    ctx: AudioContext; gains: Map<string, GainNode>; buffers: Map<string, AudioBuffer>; sources: Map<string, AudioBufferSourceNode>;
  } | null>(null);

  const { activeStems, gameStatus, startGame, submitGuess, skipTurn, currentSong } = useGameStore();
  const allStemsOrder = ['drums', 'bass', 'synth', 'vocals', 'full'];

  const playAllStems = (activeList: string[]) => {
    if (!engineRef.current) return;
    const { ctx, buffers, sources, gains } = engineRef.current;
    sources.forEach(s => { try { s.stop(); } catch(e){} });
    sources.clear();
    allStemsOrder.forEach((stemName) => {
      const buffer = buffers.get(stemName);
      const gainNode = gains.get(stemName);
      if (buffer && gainNode) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        gainNode.gain.value = activeList.includes(stemName) ? 1 : 0;
        source.connect(gainNode);
        source.start(0);
        sources.set(stemName, source);
      }
    });
  };

  const handleStartGame = async () => {
    if (gunlukLimitAsildi) return;
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') await ctx.resume();
// YENİ: Hangi şarkıda olduğunu API'ye bildiriyoruz (0, 1 veya 2)
const response = await fetch(`/api/songs/random?index=${tamamlananSarkiSayisi}`);
const songData = await response.json();
      startGame(songData, ['drums']);
      const buffersMap = new Map();
      const gainsMap = new Map();
      for (const stem of songData.stems) {
        const res = await fetch(stem.audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffersMap.set(stem.type, audioBuffer);
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainsMap.set(stem.type, gainNode);
      }
      engineRef.current = { ctx, gains: gainsMap, buffers: buffersMap, sources: new Map() };
      playAllStems(['drums']);
    } catch (e) { alert("Başlatılamadı!"); }
  };

  const handleSkip = () => {
    const currentIndex = activeStems.length - 1;
    
    if (allStemsOrder[currentIndex] === 'full') {
      alert(`Hakkın bitti! Şarkı: ${currentSong?.title}`);
      const yeniSayi = tamamlananSarkiSayisi + 1;
      setTamamlananSarkiSayisi(yeniSayi);
      const today = new Date().toLocaleDateString();
      localStorage.setItem("bandle_daily_v2", JSON.stringify({ date: today, count: yeniSayi }));
      window.location.reload();
      return;
    }

    const nextStem = allStemsOrder[activeStems.length];
    const newList = [...activeStems, nextStem];
    skipTurn();
    playAllStems(newList);
  };

  const handleGuess = (e: React.FormEvent) => {
  e.preventDefault();
  if (!guessInput.trim()) return;
  
  // Gelişmiş Türkçe karakter desteği
  const normalize = (str: string) => {
    return str
      .toLocaleLowerCase('tr-TR')
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  };

  if (normalize(guessInput) === normalize(currentSong?.title || "")) {
    submitGuess(guessInput); // Oyunu "Kazanıldı" moduna geçir
    
    // YENİ: Puanı tam bu anda, kaçıncı aşamada olduğuna bakarak hesapla
    const puan = 100 - ((activeStems.length - 1) * 20);
    puanKaydet(Math.max(puan, 20)); // Puanı veritabanına gönder
    
  } else {
    handleSkip(); // Yanlışsa bir sonraki aşamaya geç veya hakkı bitir
  }
  setGuessInput('');
};

  // --- EKRANLAR ---

  // Yüklenme anında siyah/mor ekranı tutarak titremeyi (flash) önlüyoruz
  if (isChecking) {
    return <div className="min-h-screen bg-purple-950"></div>;
  }

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-purple-950 text-white p-4 font-sans">
        <div className="bg-purple-900 p-10 rounded-[40px] shadow-2xl flex flex-col items-center border border-purple-800 w-full max-w-md">
          <h1 className="text-4xl sm:text-5xl font-black mb-2 text-white tracking-tighter text-center">DOSTLAR GAZİNOSU</h1>
          <p className="text-purple-300 mb-8 text-center text-sm font-medium">5 Şarkı Hakkı • Günlük Rekabet</p>
          <input 
            type="text" placeholder="İsminiz..." value={username}
            className="w-full bg-purple-950 border-2 border-purple-800 p-5 rounded-2xl text-white outline-none focus:border-purple-500 mb-4 transition-all"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()}
          />
          <button onClick={handleLoginSubmit} className="w-full bg-white text-purple-950 py-5 rounded-2xl font-black text-xl hover:bg-purple-100 transition-all active:scale-95">GİRİŞ YAP</button>
        </div>
      </div>
    );
  }

  if (gunlukLimitAsildi) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-purple-950 text-white p-4">
        <div className="bg-purple-900 p-10 rounded-[40px] border border-purple-800 text-center max-w-md w-full shadow-2xl">
          <div className="text-7xl mb-6">🏁</div>
          <h2 className="text-3xl font-black mb-2">Günlük Sınır!</h2>
          <p className="text-purple-200 mb-8">Bugünkü 5 şarkı hakkını kullandın. Yarın yeni şarkılarla tekrar gel!</p>
          <button onClick={() => window.location.href = "/leaderboard"} className="w-full bg-white text-purple-950 font-black py-5 rounded-2xl transition active:scale-95">LİDERLİK TABLOSU</button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-purple-950 text-white flex flex-col items-center justify-center p-6 relative font-sans">
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center max-w-4xl mx-auto w-full">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold">Oyuncu</span>
          <span className="text-white font-black text-lg">{username}</span>
        </div>
        <div className="bg-purple-900 px-6 py-2 rounded-full border border-purple-800 flex items-center gap-3">
          <span className="text-xs font-bold text-purple-300">Şarkı:</span>
          <span className="text-white font-black">{tamamlananSarkiSayisi + 1} / 5</span>
        </div>
      </div>

      <h1 className="text-4xl sm:text-6xl font-black mb-12 text-white tracking-tighter italic text-center">DOSTLAR GAZİNOSU</h1>
      
      {gameStatus === 'idle' ? (
        <button onClick={handleStartGame} className="bg-white text-purple-950 px-16 py-8 rounded-[30px] font-black text-3xl shadow-2xl active:scale-95 transition-all">OYUNA BAŞLA</button>
      ) : (
        <div className="w-full max-w-md space-y-8">
          <div className="flex gap-2">
            {allStemsOrder.map((stem) => (
              <div key={stem} className={`flex-1 h-2.5 rounded-full transition-all duration-700 ${activeStems.includes(stem) ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'bg-purple-900'}`} />
            ))}
          </div>

          <div className="bg-purple-900 p-10 rounded-[40px] shadow-2xl border border-purple-800 relative overflow-hidden">
            {gameStatus === 'won' ? (
              <div className="text-center space-y-4 py-4 animate-bounce">
                <h2 className="text-4xl font-black text-white">BİLDİN! 🎸</h2>
                <p className="text-lg text-purple-200">{currentSong?.artist} - {currentSong?.title}</p>
              </div>
            ) : (
              <form onSubmit={handleGuess} className="space-y-5">
                <input 
                  type="text" value={guessInput} onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Şarkı adını tahmin et..."
                  className="w-full bg-purple-950 border-2 border-purple-800 p-5 rounded-2xl text-white placeholder-purple-500 outline-none focus:border-purple-400 transition-all text-lg"
                />
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 bg-white text-purple-950 font-black p-5 rounded-2xl text-lg hover:bg-purple-100 transition">TAHMİN</button>
                  <button type="button" onClick={handleSkip} className="flex-1 bg-purple-800 text-white font-black p-5 rounded-2xl text-lg hover:bg-purple-700 transition border border-purple-700">
                    {activeStems.length === 5 ? 'BİTİR' : 'PAS (+1)'}
                  </button>
                </div>
              </form>
            )}
          </div>
          
          {/* YENİ: AŞAMA İSMİNİ GÖSTEREN KISIM */}
          {gameStatus !== 'won' && (
            <p className="text-center text-purple-400 text-sm font-bold uppercase tracking-widest">
              {activeStems.length}. Aşama: <span className="text-white ml-1">{stageNames[activeStems[activeStems.length - 1] as keyof typeof stageNames]}</span>
            </p>
          )}
        </div>
      )}
    </main>
  );
}