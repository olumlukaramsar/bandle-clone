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
  startOffset: number;   // play/pause için geçen süreyi saklar
  startTime: number;     // AudioContext.currentTime başlangıcı
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
const STAGE_PENALTY = 20;   // her aşama için puan cezası
const MAX_TIME_BONUS = 90;  // maksimum hız bonusu (artırıldı)
const TIME_BONUS_MULT = 1.5; // hız bonusu çarpanı

// ─── Yardımcı: Türkçe normalize ───────────────────────────────────────────
const normalize = (str: string) =>
  str
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

// ─── Yardımcı: Puan hesapla ───────────────────────────────────────────────
// Taban: 150, hız bonusu 1.5x çarpanlı
const calcScore = (activeStems: string[], elapsedSec: number): number => {
  const stagePenalty = (activeStems.length - 1) * STAGE_PENALTY;
  const rawTimeBonus = Math.max(0, MAX_TIME_BONUS - Math.floor(elapsedSec));
  const timeBonus = Math.round(rawTimeBonus * TIME_BONUS_MULT);
  return Math.max(20, 150 - stagePenalty) + timeBonus;
};

// ─── Component ────────────────────────────────────────────────────────────
export default function Home() {
  // Kullanıcı / Oturum
  const [username, setUsername] = useState('');
  const [phase, setPhase] = useState<GamePhase>('login');
  const [isSaving, setIsSaving] = useState(false);

  // Günlük limit
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionScore, setSessionScore] = useState(0);

  // Tahmin formu
  const [guessInput, setGuessInput] = useState('');
  const [shakeInput, setShakeInput] = useState(false);
  const [wrongBorder, setWrongBorder] = useState(false);

  // Ses / yükleme
  const engineRef = useRef<AudioEngine | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Timer
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ara ekran (bildin / bitti) mesajı
  const [betweenMsg, setBetweenMsg] = useState('');
  const [lastScore, setLastScore] = useState(0);

  // Leaderboard modal
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<{ username: string; points: number }[]>([]);

  // Oyun store
  const { activeStems, gameStatus, startGame, submitGuess, skipTurn, currentSong } = useGameStore();

  // ── İlk Yükleme ─────────────────────────────────────────────────────────
  useEffect(() => {
    const savedName = localStorage.getItem('bandle_username');
    if (savedName) {
      setUsername(savedName);
    }

    const today = new Date().toLocaleDateString('tr-TR');
    const savedDaily = localStorage.getItem('bandle_daily_v3');
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
        localStorage.setItem('bandle_daily_v3', JSON.stringify({ date: today, count: 0, score: 0 }));
      }
    } else {
      localStorage.setItem('bandle_daily_v3', JSON.stringify({ date: today, count: 0, score: 0 }));
    }

    if (savedName) setPhase('ready');
    else setPhase('login');
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    stopTimer();
    setElapsedSec(0);
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Ses Motoru: Play/Pause ───────────────────────────────────────────────
  const stopAllSources = () => {
    if (!engineRef.current) return;
    engineRef.current.sources.forEach(s => { try { s.stop(); } catch (_) {} });
    engineRef.current.sources.clear();
  };

  const playStemsFrom = (activeList: string[], offset = 0) => {
    if (!engineRef.current) return;
    const { ctx, buffers, gains, sources } = engineRef.current;
    stopAllSources();
    STEM_ORDER.forEach(stem => {
      const buffer = buffers.get(stem);
      const gain = gains.get(stem);
      if (!buffer || !gain) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      // Bass enstrümanı öne çıkarılır (1.7x kazanç)
      const stemGain = stem === 'bass' ? 1.7 : 1;
      gain.gain.value = activeList.includes(stem) ? stemGain : 0;
      src.connect(gain);
      src.start(0, offset % buffer.duration);
      sources.set(stem, src);
    });
    engineRef.current.startTime = ctx.currentTime - offset;
    engineRef.current.startOffset = offset;
    engineRef.current.isPlaying = true;
  };

  const handlePlayPause = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    if (eng.isPlaying) {
      // Sadece sesi durdur — timer DEVAM EDER
      const elapsed = eng.ctx.currentTime - eng.startTime + eng.startOffset;
      stopAllSources();
      eng.startOffset = elapsed;
      eng.isPlaying = false;
      // stopTimer() KALDIRILDI: süre duraklatmada akmaya devam eder
    } else {
      playStemsFrom([...activeStems], eng.startOffset);
      // Timer zaten çalışıyorsa tekrar başlatma
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
      }
    }
  };

  const handleRewind = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    const newOffset = Math.max(0, (eng.startOffset + (eng.ctx.currentTime - eng.startTime)) - 5);
    playStemsFrom([...activeStems], newOffset);
  };

  // ── Şarkı Yükle ─────────────────────────────────────────────────────────
  const loadSong = async (index: number) => {
    setPhase('loading');
    setLoadingProgress(0);
    setGuessInput('');
    setElapsedSec(0);

    try {
      // AudioContext oluştur veya resume et
      let ctx: AudioContext;
      if (engineRef.current) {
        stopAllSources();
        ctx = engineRef.current.ctx;
        if (ctx.state === 'suspended') await ctx.resume();
      } else {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
        if (ctx.state === 'suspended') await ctx.resume();
      }

      const res = await fetch(`/api/songs/random?index=${index}`);
      const songData = await res.json();
      startGame(songData, ['drums']);

      const totalStems = songData.stems.length;
      let loaded = 0;
      const buffersMap = new Map<string, AudioBuffer>();
      const gainsMap = new Map<string, GainNode>();

      await Promise.all(
        songData.stems.map(async (stem: { type: string; audioUrl: string }) => {
          const r = await fetch(stem.audioUrl);
          const ab = await r.arrayBuffer();
          const audio = await ctx.decodeAudioData(ab);
          buffersMap.set(stem.type, audio);
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gainsMap.set(stem.type, gain);
          loaded++;
          setLoadingProgress(Math.round((loaded / totalStems) * 100));
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

      playStemsFrom(['drums']);
      startTimer();
      setPhase('playing');
    } catch (e) {
      console.error(e);
      setPhase('ready');
      alert('Şarkı yüklenemedi, tekrar dene.');
    }
  };

  // ── PAS ──────────────────────────────────────────────────────────────────
  const handleSkip = () => {
    if (!engineRef.current) return;
    const currentIndex = activeStems.length - 1;

    if (STEM_ORDER[currentIndex] === 'full') {
      // Haklar bitti, şarkıyı geç
      finishSong(0, false);
      return;
    }

    const nextStem = STEM_ORDER[activeStems.length] as StemType;
    const newList = [...activeStems, nextStem];
    skipTurn();
    playStemsFrom(newList);
  };

  // ── TAHMİN ───────────────────────────────────────────────────────────────
  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;

    if (normalize(guessInput) === normalize(currentSong?.title || '')) {
      // Doğru: önce AudioContext durumunu kaydet, sonra state güncelle
      submitGuess(guessInput);
      const score = calcScore(activeStems, elapsedSec);
      // AudioContext akışını kesmeden finishSong çağır
      finishSong(score, true);
    } else {
      // Yanlış: sadece UI state güncellenir, AudioContext'e dokunulmaz
      setGuessInput('');
      setShakeInput(true);
      setWrongBorder(true);
      // Animasyon timeout'ları AudioContext dışında izole çalışır
      const shakeTimer = setTimeout(() => setShakeInput(false), 500);
      const borderTimer = setTimeout(() => setWrongBorder(false), 1500);
      // Cleanup için ref tutmak yerine GC'ye bırak (kısa süreli)
      return () => { clearTimeout(shakeTimer); clearTimeout(borderTimer); };
    }
  };

  // ── Şarkı Bitişi ──────────────────────────────────────────────────────────
  const finishSong = async (score: number, won: boolean) => {
    stopTimer();
    stopAllSources();

    const newCompleted = completedCount + 1;
    const newTotalScore = sessionScore + score;
    setCompletedCount(newCompleted);
    setSessionScore(newTotalScore);
    setLastScore(score);

    const today = new Date().toLocaleDateString('tr-TR');
    localStorage.setItem('bandle_daily_v3', JSON.stringify({ date: today, count: newCompleted, score: newTotalScore }));

    // Puanı API'ye gönder
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
      // Limit doldu → leaderboard'u getir
      setBetweenMsg(won ? `🎸 Bildin! +${score} puan` : `❌ ${currentSong?.title} — bilemedin`);
      await fetchLeaderboard();
      setPhase('limit');
    } else {
      setBetweenMsg(won ? `🎸 BİLDİN! +${score} puan` : `❌ Bilemledin — ${currentSong?.artist} / ${currentSong?.title}`);
      setPhase('between');
    }
  };

  // ── Sıradaki Şarkı ────────────────────────────────────────────────────────
  const goNextSong = () => {
    loadSong(completedCount); // completedCount zaten artmış
  };

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboardData(data.slice(0, 20));
    } catch (_) {}
  };

  // ── Giriş ────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    if (username.trim().length < 2) {
      alert('Lütfen en az 2 karakterli bir isim gir!');
      return;
    }
    localStorage.setItem('bandle_username', username.trim());
    setPhase('ready');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // EKRANLAR
  // ──────────────────────────────────────────────────────────────────────────

  // ── Login ────────────────────────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div className="inline-block text-[10px] tracking-[0.3em] text-purple-400 uppercase mb-3 font-bold">Müzik Tahmin Oyunu</div>
            <h1 className="text-5xl font-black text-white leading-none tracking-tight">DOSTLAR<br/><span className="text-purple-400">GAZİNOSU</span></h1>
            <p className="text-purple-500 text-xs mt-3">{DAILY_LIMIT} şarkı · Günlük rekabet</p>
          </div>
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-8 space-y-4 shadow-[0_0_80px_rgba(139,92,246,0.15)]">
            <input
              type="text"
              placeholder="İsminiz..."
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-[#0d0014] border-2 border-purple-900 rounded-2xl px-5 py-4 text-white placeholder-purple-700 outline-none focus:border-purple-500 transition-all text-base"
            />
            <button
              onClick={handleLogin}
              className="w-full bg-purple-500 hover:bg-purple-400 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] text-lg tracking-wide"
            >
              GİRİŞ YAP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="text-center">
          <p className="text-purple-500 text-xs tracking-[0.3em] uppercase mb-4">Hoş geldin, {username}</p>
          <h1 className="text-6xl font-black text-white tracking-tight mb-2">DOSTLAR<br/><span className="text-purple-400">GAZİNOSU</span></h1>
          <p className="text-purple-600 text-sm mb-12">Şarkı 1 / {DAILY_LIMIT}</p>
          <button
            onClick={() => loadSong(0)}
            className="bg-purple-500 hover:bg-purple-400 text-white font-black px-16 py-6 rounded-[28px] text-2xl transition-all active:scale-95 shadow-[0_0_40px_rgba(139,92,246,0.4)]"
          >
            OYUNA BAŞLA
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex flex-col items-center justify-center p-4 gap-8">
        <style>{animations}</style>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            {[0,1,2,3].map(i => (
              <div key={i} className="absolute inset-0 rounded-full border-2 border-purple-500 opacity-0" style={{ animation: `ping 1.5s ${i * 0.3}s ease-out infinite` }} />
            ))}
            <div className="absolute inset-2 rounded-full bg-purple-500 opacity-60 animate-pulse" />
          </div>
          <p className="text-white font-bold text-lg mb-2">Şarkı Yükleniyor...</p>
          <p className="text-purple-500 text-sm">Ses dosyaları hazırlanıyor</p>
        </div>
        <div className="w-64">
          <div className="h-1.5 bg-purple-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-400 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-purple-600 text-xs text-center mt-2">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  // ── Between Songs ─────────────────────────────────────────────────────────
  if (phase === 'between') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm text-center">
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-10 shadow-[0_0_80px_rgba(139,92,246,0.15)] space-y-6">
            <p className="text-2xl font-black text-white">{betweenMsg}</p>
            <div className="border-t border-purple-900 pt-6">
              <p className="text-purple-500 text-xs uppercase tracking-widest mb-1">Toplam Puan</p>
              <p className="text-5xl font-black text-purple-300">{sessionScore}</p>
              <p className="text-purple-600 text-sm mt-1">{completedCount} / {DAILY_LIMIT} şarkı</p>
            </div>
            {isSaving ? (
              <p className="text-purple-500 text-sm animate-pulse">Puan kaydediliyor…</p>
            ) : (
              <button
                onClick={goNextSong}
                className="w-full bg-purple-500 hover:bg-purple-400 text-white font-black py-5 rounded-2xl text-lg transition-all active:scale-[0.98]"
              >
                SONRAKİ ŞARKI →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Limit / Günlük Bitti ──────────────────────────────────────────────────
  if (phase === 'limit') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <div className="w-full max-w-sm">
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-8 shadow-[0_0_80px_rgba(139,92,246,0.15)] space-y-6">
            <div className="text-center">
              <div className="text-6xl mb-4">🏁</div>
              <h2 className="text-3xl font-black text-white mb-1">Günlük Sınır!</h2>
              <p className="text-purple-400 text-sm">Bugünkü {DAILY_LIMIT} şarkı hakkını kullandın.</p>
            </div>
            <div className="text-center border-t border-purple-900 pt-6">
              <p className="text-purple-500 text-xs uppercase tracking-widest mb-1">Toplam Puanın</p>
              <p className="text-5xl font-black text-purple-300">{sessionScore}</p>
            </div>
            <button
              onClick={async () => { await fetchLeaderboard(); setShowLeaderboard(true); }}
              className="w-full bg-purple-500 hover:bg-purple-400 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98]"
            >
              LİDERLİK TABLOSU
            </button>
            <p className="text-center text-purple-700 text-xs">Yarın yeni şarkılarla tekrar gel!</p>
          </div>
        </div>

        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-[#160022] border border-purple-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white">Liderlik Tablosu</h3>
                <button onClick={() => setShowLeaderboard(false)} className="text-purple-500 hover:text-white transition text-2xl leading-none">×</button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-purple-950/40"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#7c3aed #1e0040' }}
              >
                {leaderboardData.length === 0 && <p className="text-purple-600 text-sm text-center py-4">Veri yükleniyor…</p>}
                {leaderboardData.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${entry.username === username ? 'bg-purple-800 border border-purple-600' : 'bg-purple-950/60'}`}
                  >
                    <span className={`text-xs font-black w-5 text-right ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-purple-600'}`}>
                      {i + 1}
                    </span>
                    <span className="text-white text-sm font-bold flex-1 truncate">{entry.username}</span>
                    <span className="text-purple-300 text-sm font-black">{entry.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  const isPlaying = engineRef.current?.isPlaying ?? false;
  const minutes = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const seconds = String(elapsedSec % 60).padStart(2, '0');
  const currentStemLabel = STEM_LABELS[activeStems[activeStems.length - 1] as StemType] ?? '';

  return (
    <main className="min-h-screen bg-[#0d0014] text-white flex flex-col p-5 font-sans">
      <style>{animations}</style>

      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <p className="text-[10px] text-purple-600 uppercase tracking-[0.2em] font-bold">Oyuncu</p>
          <p className="text-white font-black text-base leading-tight">{username}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-purple-600 uppercase tracking-[0.2em] font-bold">Puan</p>
            <p className="text-white font-black text-base">{sessionScore}</p>
          </div>
          <div className="bg-purple-900/60 border border-purple-800 rounded-full px-4 py-1.5 text-xs font-black text-purple-300">
            {completedCount + 1} / {DAILY_LIMIT}
          </div>
        </div>
      </header>

      <h1 className="text-3xl sm:text-4xl font-black tracking-tight italic text-center mb-1">DOSTLAR GAZİNOSU</h1>
      <p className="text-purple-600 text-xs text-center mb-8">Bazen şarkılar geç yüklenebilir, bekle!</p>

      {/* Stem Progress Bar */}
      <div className="flex gap-1.5 mb-6">
        {STEM_ORDER.map(stem => (
          <div
            key={stem}
            title={STEM_LABELS[stem]}
            className={`flex-1 h-2 rounded-full transition-all duration-700 ${activeStems.includes(stem) ? 'bg-purple-400 shadow-[0_0_12px_rgba(167,139,250,0.7)]' : 'bg-purple-950'}`}
          />
        ))}
      </div>

      {/* Main Game Card */}
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-5">

        {/* Stage + Timer */}
        <div className="flex justify-between items-center px-1">
          <p className="text-purple-500 text-xs font-bold uppercase tracking-widest">
            Aşama {activeStems.length}: <span className="text-purple-300 ml-1">{currentStemLabel}</span>
          </p>
          <p className="text-purple-400 text-xs font-mono font-bold">{minutes}:{seconds}</p>
        </div>

        {/* Audio Controls */}
        <div className="flex gap-3">
          <button
            onClick={handleRewind}
            className="flex-1 bg-purple-900/60 border border-purple-800 rounded-2xl py-4 font-black text-sm hover:bg-purple-800/60 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="text-lg">⏪</span> -5s
          </button>
          <button
            onClick={handlePlayPause}
            className="flex-[2] bg-purple-500 hover:bg-purple-400 rounded-2xl py-4 font-black text-sm transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="text-lg">{isPlaying ? '⏸' : '▶️'}</span>
            {isPlaying ? 'DURAKLAT' : 'DEVAM ET'}
          </button>
        </div>

        {/* Guess Form */}
        {gameStatus === 'won' ? (
          <div className="bg-[#160022] border border-purple-700 rounded-3xl p-10 text-center space-y-2">
            <p className="text-5xl mb-2">🎸</p>
            <h2 className="text-3xl font-black text-white">BİLDİN!</h2>
            <p className="text-purple-300">{currentSong?.artist} – {currentSong?.title}</p>
            <p className="text-purple-500 text-sm">+{lastScore} puan</p>
            {isSaving && <p className="text-purple-600 text-xs animate-pulse">Kaydediliyor…</p>}
          </div>
        ) : (
          <form onSubmit={handleGuess} className="space-y-3">
            <input
              type="text"
              value={guessInput}
              onChange={e => setGuessInput(e.target.value)}
              placeholder="Şarkı adını tahmin et..."
              className={`w-full bg-[#160022] border-2 rounded-2xl px-5 py-5 text-white placeholder-purple-700 outline-none transition-all text-base ${
                wrongBorder ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'border-purple-900 focus:border-purple-500'
              } ${shakeInput ? 'animate-shake' : ''}`}
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-purple-500 hover:bg-purple-400 text-white font-black py-5 rounded-2xl text-base transition active:scale-[0.98]"
              >
                TAHMİN
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 bg-transparent border-2 border-purple-800 hover:border-purple-600 text-purple-300 font-black py-5 rounded-2xl text-base transition active:scale-[0.98]"
              >
                {activeStems.length >= STEM_ORDER.length ? 'BİTİR' : 'PAS (+1)'}
              </button>
            </div>
          </form>
        )}

        {/* Expected score preview */}
        {gameStatus !== 'won' && (
          <p className="text-center text-purple-700 text-xs">
            Şu an: <span className="text-purple-500 font-bold">{calcScore(activeStems, elapsedSec)} puan</span>
          </p>
        )}
      </div>
    </main>
  );
}

// ─── CSS Animations (inline) ───────────────────────────────────────────────
const animations = `
  @keyframes ping {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(2); opacity: 0; }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }
  .animate-shake { animation: shake 0.5s ease; }
`;
