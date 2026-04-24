"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';

// ─── Tipler ────────────────────────────────────────────────────────────────
type GamePhase = 'login' | 'ready' | 'loading' | 'playing' | 'between' | 'limit';

interface AudioEngine {
  ctx: AudioContext;
  gains: Map<string, GainNode>;
  buffers: Map<string, AudioBuffer>;
  sources: Map<string, AudioBufferSourceNode>;
  startOffset: number;   // play/pause için geçen kümülatif süreyi saklar
  startTime: number;     // ctx.currentTime üzerindeki başlangıç referansı
  isPlaying: boolean;
}

// ─── Sabitler ──────────────────────────────────────────────────────────────
const STEM_ORDER = ['drums', 'bass', 'synth', 'vocals', 'full'] as const;
type StemType = typeof STEM_ORDER[number];

const STEM_LABELS: Record<StemType, string> = {
  drums:  'Bateri',
  bass:   'Bass Gitar',
  synth:  'Klavye / Synth',
  vocals: 'Vokal',
  full:   'Full Versiyon',
};

const DAILY_LIMIT = 3;
const STAGE_PENALTY = 20;   
const MAX_TIME_BONUS = 90;  
const TIME_BONUS_MULT = 1.5; 

// ─── Yardımcılar ──────────────────────────────────────────────────────────
const normalize = (str: string) =>
  str
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

const calcScore = (activeStems: string[], elapsedSec: number): number => {
  const stagePenalty = (activeStems.length - 1) * STAGE_PENALTY;
  const rawTimeBonus = Math.max(0, MAX_TIME_BONUS - Math.floor(elapsedSec));
  const timeBonus = Math.round(rawTimeBonus * TIME_BONUS_MULT);
  return Math.max(20, 150 - stagePenalty) + timeBonus;
};

export default function Home() {
  const [username, setUsername] = useState('');
  const [phase, setPhase] = useState<GamePhase>('login');
  const [isSaving, setIsSaving] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionScore, setSessionScore] = useState(0);
  const [guessInput, setGuessInput] = useState('');
  const [shakeInput, setShakeInput] = useState(false);
  const [wrongBorder, setWrongBorder] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [betweenMsg, setBetweenMsg] = useState('');
  const [lastScore, setLastScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<{ username: string; points: number }[]>([]);

  const { activeStems, gameStatus, startGame, submitGuess, skipTurn, currentSong } = useGameStore();

  // ── İlk Yükleme ve Versiyon Kontrolü (v4) ───────────────────────────────────
  useEffect(() => {
    const savedName = localStorage.getItem('bandle_username');
    if (savedName) setUsername(savedName);

    const today = new Date().toLocaleDateString('tr-TR');
    const savedDaily = localStorage.getItem('bandle_daily_v4');
    if (savedDaily) {
      const parsed = JSON.parse(savedDaily);
      if (parsed.date === today) {
        setCompletedCount(parsed.count);
        setSessionScore(parsed.score ?? 0);
        if (parsed.count >= DAILY_LIMIT) {
          setPhase('limit');
          return;
        }
      } else {
        localStorage.setItem('bandle_daily_v4', JSON.stringify({ date: today, count: 0, score: 0 }));
      }
    } else {
      localStorage.setItem('bandle_daily_v4', JSON.stringify({ date: today, count: 0, score: 0 }));
    }

    if (savedName) setPhase('ready');
    else setPhase('login');
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedSec(0);
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Ses Motoru Fonksiyonları ──────────────────────────────────────────────
  const stopAllSources = () => {
    if (!engineRef.current) return;
    engineRef.current.sources.forEach(s => { try { s.stop(); } catch (_) {} });
    engineRef.current.sources.clear();
  };

  const playStemsFrom = (activeList: string[], offset = 0) => {
    if (!engineRef.current) return;
    const { ctx, buffers, gains, sources } = engineRef.current;
    
    stopAllSources();

    const isFull = activeList.includes('full');
    const startTime = ctx.currentTime; // Strict Sync Lock

    STEM_ORDER.forEach(stem => {
      const buffer = buffers.get(stem);
      const gain = gains.get(stem);
      if (!buffer || !gain) return;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      // Full İzolasyonu: Full açıksa diğer her şey 0 gain olur.
      let targetGain: number;
      if (isFull) {
        targetGain = stem === 'full' ? 1 : 0;
      } else {
        if (activeList.includes(stem)) {
          targetGain = stem === 'bass' ? 1.7 : 1; // Bass Boost
        } else {
          targetGain = 0;
        }
      }
      
      // Gain'i yumuşak geçişle (0.05s) ayarla (Patlamayı engellemek için)
      gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);

      src.connect(gain);
      // Kesintisiz Geçiş: Tüm stemler aynı offset ile başlatılır
      src.start(startTime, offset % buffer.duration);
      sources.set(stem, src);
    });

    engineRef.current.startTime = startTime;
    engineRef.current.startOffset = offset;
    engineRef.current.isPlaying = true;
  };

  const handlePlayPause = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    if (eng.isPlaying) {
      const currentPos = eng.startOffset + (eng.ctx.currentTime - eng.startTime);
      stopAllSources();
      eng.startOffset = currentPos;
      eng.isPlaying = false;
      // Puanlama süresi durmaz!
    } else {
      playStemsFrom([...activeStems], eng.startOffset);
    }
  };

  const handleRewind = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    const currentPos = eng.isPlaying 
      ? eng.startOffset + (eng.ctx.currentTime - eng.startTime)
      : eng.startOffset;
    
    const newOffset = Math.max(0, currentPos - 5);
    playStemsFrom([...activeStems], newOffset);
  };

  const loadSong = async (index: number) => {
    setPhase('loading');
    setLoadingProgress(0);
    setGuessInput('');
    setElapsedSec(0);

    try {
      let ctx: AudioContext;
      if (engineRef.current) {
        stopAllSources();
        ctx = engineRef.current.ctx;
      } else {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') await ctx.resume();

      const res = await fetch(`/api/songs/random?index=${index}`);
      const songData = await res.json();
      startGame(songData, ['drums']);

      const totalStems = songData.stems.length;
      let loadedCount = 0;
      const buffersMap = new Map<string, AudioBuffer>();
      const gainsMap = new Map<string, GainNode>();

      await Promise.all(
        songData.stems.map(async (stem: any) => {
          const r = await fetch(stem.audioUrl);
          const ab = await r.arrayBuffer();
          const audio = await ctx.decodeAudioData(ab);
          buffersMap.set(stem.type, audio);
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gainsMap.set(stem.type, gain);
          loadedCount++;
          setLoadingProgress(Math.round((loadedCount / totalStems) * 100));
        })
      );

      engineRef.current = {
        ctx,
        gains: gainsMap,
        buffers: buffersMap,
        sources: new Map(),
        startOffset: 0,
        startTime: 0,
        isPlaying: false,
      };

      playStemsFrom(['drums'], 0);
      startTimer();
      setPhase('playing');
    } catch (e) {
      console.error(e);
      setPhase('ready');
      alert('Şarkı yüklenemedi, lütfen tekrar dene.');
    }
  };

  const handleSkip = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    
    // Kesintisiz Geçiş için o anki saniyeyi hesapla
    const currentPos = eng.isPlaying 
      ? eng.startOffset + (eng.ctx.currentTime - eng.startTime)
      : eng.startOffset;

    const currentIndex = activeStems.length - 1;
    if (STEM_ORDER[currentIndex] === 'full') {
      finishSong(0, false);
      return;
    }

    const nextStem = STEM_ORDER[activeStems.length] as StemType;
    const newList = [...activeStems, nextStem];
    skipTurn(); // Store'u güncelle
    playStemsFrom(newList, currentPos); // Kaldığı saniyeden başlat
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;

    if (normalize(guessInput) === normalize(currentSong?.title || '')) {
      const score = calcScore(activeStems, elapsedSec);
      submitGuess(guessInput);
      finishSong(score, true);
    } else {
      setGuessInput('');
      setShakeInput(true);
      setWrongBorder(true);
      setTimeout(() => setShakeInput(false), 500);
      setTimeout(() => setWrongBorder(false), 1500);
    }
  };

  const finishSong = async (score: number, won: boolean) => {
    stopTimer();
    stopAllSources();

    const newCompleted = completedCount + 1;
    const newTotalScore = sessionScore + score;
    setCompletedCount(newCompleted);
    setSessionScore(newTotalScore);
    setLastScore(score);

    const today = new Date().toLocaleDateString('tr-TR');
    localStorage.setItem('bandle_daily_v4', JSON.stringify({ date: today, count: newCompleted, score: newTotalScore }));

    if (score > 0) {
      setIsSaving(true);
      try {
        await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, points: score }),
        });
      } catch (err) {
        console.error('Puan gönderilemedi:', err);
      } finally {
        setIsSaving(false);
      }
    }

    if (newCompleted >= DAILY_LIMIT) {
      setBetweenMsg(won ? `🎸 Bildin! +${score} Puan` : `❌ ${currentSong?.title} – Bilemedin!`);
      await fetchLeaderboard();
      setPhase('limit');
    } else {
      setBetweenMsg(won ? `🎸 BİLDİN! +${score} Puan` : `❌ Bilemedin – Doğru Cevap: ${currentSong?.title}`);
      setPhase('between');
    }
  };

  const goNextSong = () => loadSong(completedCount);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboardData(data);
    } catch (_) {}
  };

  const handleLogin = () => {
    if (username.trim().length < 2) return alert('İsim çok kısa!');
    localStorage.setItem('bandle_username', username.trim());
    setPhase('ready');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // ARAYÜZ (RENDER)
  // ──────────────────────────────────────────────────────────────────────────

  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm text-center">
          <div className="mb-10">
            <div className="text-[10px] tracking-[0.3em] text-purple-400 uppercase mb-3 font-bold">Müzik Tahmin Oyunu</div>
            <h1 className="text-5xl font-black text-white leading-none">DOSTLAR<br/><span className="text-purple-400">GAZİNOSU</span></h1>
          </div>
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-8 space-y-4 shadow-xl">
            <input
              type="text"
              placeholder="Sahne adınız..."
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-[#0d0014] border-2 border-purple-900 rounded-2xl px-5 py-4 text-white placeholder-purple-800 outline-none focus:border-purple-500"
            />
            <button onClick={handleLogin} className="w-full bg-purple-500 text-white font-black py-4 rounded-2xl text-lg hover:bg-purple-400">GİRİŞ YAP</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex flex-col items-center justify-center p-4">
        <style>{animations}</style>
        <h1 className="text-6xl font-black text-white text-center mb-12">DOSTLAR<br/><span className="text-purple-400">GAZİNOSU</span></h1>
        <button onClick={() => loadSong(0)} className="bg-purple-500 text-white font-black px-16 py-6 rounded-full text-2xl shadow-lg hover:scale-105 transition-transform">OYUNA BAŞLA</button>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex flex-col items-center justify-center p-4 gap-8">
        <style>{animations}</style>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
             <div className="absolute inset-0 rounded-full border-2 border-purple-500 animate-ping" />
             <div className="absolute inset-2 rounded-full bg-purple-500 animate-pulse" />
          </div>
          <p className="text-white font-bold text-lg">Sesler Hazırlanıyor...</p>
        </div>
        <div className="w-64">
          <div className="h-2 bg-purple-950 rounded-full overflow-hidden">
            <div className="h-full bg-purple-400 transition-all" style={{ width: `${loadingProgress}%` }} />
          </div>
          <p className="text-purple-600 text-xs text-center mt-2">%{loadingProgress}</p>
        </div>
      </div>
    );
  }

  if (phase === 'between') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm bg-[#160022] border border-purple-900 rounded-3xl p-10 text-center shadow-2xl space-y-6">
          <p className="text-3xl font-black text-white">{betweenMsg}</p>
          <div className="border-y border-purple-900 py-6">
             <p className="text-purple-500 text-[10px] uppercase tracking-widest">Toplam Puan</p>
             <p className="text-5xl font-black text-purple-300">{sessionScore}</p>
          </div>
          <button onClick={goNextSong} className="w-full bg-purple-500 text-white font-black py-5 rounded-2xl text-lg hover:bg-purple-400 transition">SONRAKİ ŞARKI →</button>
        </div>
      </div>
    );
  }

  if (phase === 'limit') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm space-y-6">
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-10 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-white mb-2">GÜNLÜK SINIR!</h2>
            <p className="text-purple-500 text-sm mb-8">Bugünlük 3 şarkıyı da bitirdin.</p>
            <div className="mb-8">
              <p className="text-purple-600 text-[10px] uppercase font-bold tracking-widest mb-1">Final Puanın</p>
              <p className="text-6xl font-black text-purple-300">{sessionScore}</p>
            </div>
            <button onClick={() => setShowLeaderboard(true)} className="w-full bg-purple-500 text-white font-black py-5 rounded-2xl hover:bg-purple-400 transition">LİDERLİK TABLOSU</button>
          </div>
        </div>

        {showLeaderboard && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-[#160022] border border-purple-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white italic">GAZİNO LİSTESİ</h3>
                <button onClick={() => setShowLeaderboard(false)} className="text-purple-500 text-3xl">&times;</button>
              </div>
              <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {leaderboardData.map((entry, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${entry.username === username ? 'bg-purple-800' : 'bg-purple-950/50'}`}>
                    <span className="w-6 text-purple-500 font-black text-xs">{i+1}.</span>
                    <span className="text-white text-sm font-bold flex-1">{entry.username}</span>
                    <span className="text-purple-300 font-black">{entry.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── OYUN EKRANI (PLAYING) ───────────────────────────────────────────────────
  const isPlaying = engineRef.current?.isPlaying ?? false;
  const minutes = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const seconds = String(elapsedSec % 60).padStart(2, '0');
  const currentStemLabel = STEM_LABELS[activeStems[activeStems.length - 1] as StemType] ?? '';

  return (
    <main className="min-h-screen bg-[#0d0014] text-white flex flex-col p-6 font-sans">
      <style>{animations}</style>

      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div className="flex flex-col">
          <span className="text-[9px] text-purple-600 font-bold uppercase tracking-widest">Sahne</span>
          <span className="font-black text-purple-200">{username}</span>
        </div>
        <div className="flex gap-4">
           <div className="text-right">
              <span className="text-[9px] text-purple-600 font-bold uppercase tracking-widest">Günün Skoru</span>
              <p className="font-black text-purple-200 text-right">{sessionScore}</p>
           </div>
           <div className="bg-purple-900/40 border border-purple-800 px-3 py-1 rounded-full flex items-center text-xs font-black text-purple-300">
             {completedCount + 1}/{DAILY_LIMIT}
           </div>
        </div>
      </header>

      <h1 className="text-3xl font-black tracking-tight italic text-center mb-8">DOSTLAR GAZİNOSU</h1>

      {/* Progress Bar */}
      <div className="flex gap-1.5 mb-8">
        {STEM_ORDER.map(stem => (
          <div
            key={stem}
            className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${activeStems.includes(stem) ? 'bg-purple-400 shadow-[0_0_10px_rgba(167,139,250,0.5)]' : 'bg-purple-950'}`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-6">
        <div className="flex justify-between items-end px-1">
           <p className="text-purple-500 text-[10px] font-black uppercase tracking-widest">
             ENSTRÜMAN: <span className="text-purple-300">{currentStemLabel}</span>
           </p>
           <p className="text-purple-400 font-mono font-bold text-sm">{minutes}:{seconds}</p>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
           <button onClick={handleRewind} className="flex-1 bg-purple-950/40 border border-purple-900 rounded-2xl py-4 hover:bg-purple-900/40 transition active:scale-95">⏪ -5s</button>
           <button onClick={handlePlayPause} className="flex-[2] bg-purple-500 rounded-2xl py-4 font-black hover:bg-purple-400 transition active:scale-95">
             {isPlaying ? '⏸ DURAKLAT' : '▶️ OYNAT'}
           </button>
        </div>

        {/* Guess Area */}
        {gameStatus === 'won' ? (
          <div className="bg-purple-900/20 border border-purple-800 rounded-3xl p-8 text-center space-y-2 animate-pop">
            <p className="text-4xl mb-2">🎸</p>
            <h2 className="text-2xl font-black">BİLDİN!</h2>
            <p className="text-purple-300 text-sm">{currentSong?.artist} – {currentSong?.title}</p>
          </div>
        ) : (
          <form onSubmit={handleGuess} className="space-y-4">
            <input
              type="text"
              value={guessInput}
              onChange={e => setGuessInput(e.target.value)}
              placeholder="Şarkının adını yaz..."
              className={`w-full bg-[#160022] border-2 rounded-2xl px-5 py-5 text-white placeholder-purple-800 outline-none transition-all ${
                wrongBorder ? 'border-red-600 animate-shake' : 'border-purple-900 focus:border-purple-500'
              }`}
            />
            <div className="flex gap-4">
               <button type="submit" className="flex-[2] bg-purple-500 text-white font-black py-5 rounded-2xl hover:bg-purple-400 transition active:scale-95">TAHMİN ET</button>
               <button type="button" onClick={handleSkip} className="flex-1 border-2 border-purple-900 text-purple-400 font-bold rounded-2xl hover:border-purple-700 transition">
                 {activeStems.length >= STEM_ORDER.length ? 'BİTİR' : 'PAS (+1)'}
               </button>
            </div>
          </form>
        )}

        {!gameStatus && (
           <p className="text-center text-[10px] text-purple-800 uppercase font-black tracking-widest">
             Tahmini Puan: <span className="text-purple-600">{calcScore(activeStems, elapsedSec)}</span>
           </p>
        )}
      </div>
    </main>
  );
}

const animations = `
  @keyframes ping { 0% { transform: scale(0.7); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
  .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #7c3aed; border-radius: 10px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
`;