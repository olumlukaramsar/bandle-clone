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
  startOffset: number;
  startTime: number;
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

// ─── Sabitler ──────────────────────────────────────────────────────────────
// Mevcut DIFFICULTY_LABELS kısmını bu şekilde güncelle:
const DIFFICULTY_LABELS: Record<string, string> = {
  '1': 'Kolay',
  '2': 'Kolay / Orta',
  '3': 'Orta',
  '4': 'Orta / Zor',
  '5': 'Zor',
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

// Sayıları formatla: 1.200.000.000 -> 1.2B, 500.000 -> 500K
const formatViews = (num: number): string => {
  if (!num) return '—';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B İzlenme`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M İzlenme`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K İzlenme`;
  return `${num} İzlenme`;
};

// Bugünün tarihine göre şarkı indeksi belirle (YYYY-MM-DD hash)
const getDailyIndex = (totalSongs: number): number => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return hash % totalSongs;
};

// Dün tarihi YYYY-MM-DD formatında
const getYesterdayStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Bugün tarihi YYYY-MM-DD formatında
const getTodayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [yesterdayData, setYesterdayData] = useState<{ username: string; points: number }[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'today' | 'yesterday'>('today');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Guess history: 'empty' | 'correct' | 'wrong'
  const [guessHistory, setGuessHistory] = useState<Array<'empty' | 'correct' | 'wrong'>>(['empty','empty','empty','empty','empty']);

  const { activeStems, gameStatus, startGame, submitGuess, skipTurn, currentSong } = useGameStore();

  // ── İlk Yükleme ve Versiyon Kontrolü (v4) ───────────────────────────────────
  useEffect(() => {
    const savedName = localStorage.getItem('bandle_username');
    if (savedName) setUsername(savedName);

    const todayStr = getTodayStr();
    const savedDaily = localStorage.getItem('bandle_daily_v5');
    if (savedDaily) {
      const parsed = JSON.parse(savedDaily);
      // Gece yarısı sıfırlama: tarih değiştiyse sıfırla
      if (parsed.date === todayStr) {
        setCompletedCount(parsed.count);
        setSessionScore(parsed.score ?? 0);
        if (parsed.count >= DAILY_LIMIT) {
          setPhase('limit');
          return;
        }
      } else {
        localStorage.setItem('bandle_daily_v5', JSON.stringify({ date: todayStr, count: 0, score: 0 }));
      }
    } else {
      localStorage.setItem('bandle_daily_v5', JSON.stringify({ date: todayStr, count: 0, score: 0 }));
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

    if (ctx.state === 'suspended') ctx.resume();
    stopAllSources();

    const isFull = activeList.includes('full');
    const startTime = ctx.currentTime;

    STEM_ORDER.forEach(stem => {
      const buffer = buffers.get(stem);
      const gain = gains.get(stem);
      if (!buffer || !gain) return;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      let targetGain: number;
      if (isFull) {
        targetGain = stem === 'full' ? 1 : 0;
      } else {
        if (activeList.includes(stem)) {
          targetGain = stem === 'bass' ? 1.7 : 1;
        } else {
          targetGain = 0;
        }
      }

      gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
      src.connect(gain);
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
    setGuessHistory(['empty','empty','empty','empty','empty']);

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

      const songRes = await fetch(`/api/songs/random?index=${index}`, {
        cache: 'no-cache',
        mode: 'cors',
      });
      if (!songRes.ok) {
        console.error(`[loadSong] Şarkı verisi alınamadı: HTTP ${songRes.status} — /api/songs/random?index=${index}`);
        throw new Error(`Şarkı verisi HTTP ${songRes.status}`);
      }
      const songData = await songRes.json();
      startGame(songData, ['drums']);

      const totalStems = songData.stems.length;
      let loadedCount = 0;
      const buffersMap = new Map<string, AudioBuffer>();
      const gainsMap = new Map<string, GainNode>();

      await Promise.all(
        songData.stems.map(async (stem: any) => {
          let r: Response;
          try {
            r = await fetch(stem.audioUrl, { cache: 'no-cache', mode: 'cors' });
          } catch (fetchErr) {
            console.error(`[loadSong] Fetch hatası — Kanal: ${stem.type}, URL: ${stem.audioUrl}`, fetchErr);
            throw fetchErr;
          }

          if (!r.ok) {
            console.error(`[loadSong] ${r.status === 404 ? '404 Bulunamadı' : `HTTP ${r.status} Hatası`} — Kanal: ${stem.type}, URL: ${stem.audioUrl}`);
            throw new Error(`Stem yüklenemedi: ${stem.type} (${r.status})`);
          }

          let audio: AudioBuffer;
          try {
            const ab = await r.arrayBuffer();
            audio = await ctx.decodeAudioData(ab);
          } catch (decodeErr) {
            console.error(`[loadSong] Decode Hatası — Kanal: ${stem.type}, URL: ${stem.audioUrl}`, decodeErr);
            throw decodeErr;
          }

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
      console.error('[loadSong] Şarkı yüklenirken genel hata:', e);
      setPhase('ready');
      alert('Şarkı yüklenemedi, lütfen tekrar dene.');
    }
  };

  const handleSkip = () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;

    const currentPos = eng.isPlaying
      ? eng.startOffset + (eng.ctx.currentTime - eng.startTime)
      : eng.startOffset;

    const currentIndex = activeStems.length - 1;
    if (STEM_ORDER[currentIndex] === 'full') {
      // Tüm guess kutularını doldur
      setGuessHistory(prev => {
        const updated = [...prev];
        const emptyIdx = updated.indexOf('empty');
        if (emptyIdx !== -1) updated[emptyIdx] = 'wrong';
        return updated;
      });
      finishSong(0, false);
      return;
    }

    setGuessHistory(prev => {
      const updated = [...prev];
      const emptyIdx = updated.indexOf('empty');
      if (emptyIdx !== -1) updated[emptyIdx] = 'wrong';
      return updated;
    });

    const nextStem = STEM_ORDER[activeStems.length] as StemType;
    const newList = [...activeStems, nextStem];
    skipTurn();
    playStemsFrom(newList, currentPos);
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;

    if (normalize(guessInput) === normalize(currentSong?.title || '')) {
      const score = calcScore(activeStems, elapsedSec);
      submitGuess(guessInput);
      setGuessHistory(prev => {
        const updated = [...prev];
        const emptyIdx = updated.indexOf('empty');
        if (emptyIdx !== -1) updated[emptyIdx] = 'correct';
        return updated;
      });
      finishSong(score, true);
    } else {
      setGuessInput('');
      setGuessHistory(prev => {
        const updated = [...prev];
        const emptyIdx = updated.indexOf('empty');
        if (emptyIdx !== -1) updated[emptyIdx] = 'wrong';
        return updated;
      });
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

    const todayStr = getTodayStr();
    localStorage.setItem('bandle_daily_v5', JSON.stringify({ date: todayStr, count: newCompleted, score: newTotalScore }));

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
    setLeaderboardLoading(true);
    try {
      const todayStr = getTodayStr();
      const [todayRes, yestRes] = await Promise.all([
        fetch(`/api/leaderboard?date=${todayStr}`, { cache: 'no-cache' }),
        fetch(`/api/leaderboard?date=${getYesterdayStr()}`, { cache: 'no-cache' }),
      ]);

      if (todayRes.ok) {
        const todayJson = await todayRes.json();
        setLeaderboardData(todayJson);
      } else {
        console.error(`[fetchLeaderboard] Bugün verisi alınamadı: HTTP ${todayRes.status}`);
      }

      if (yestRes.ok) {
        const yestJson = await yestRes.json();
        setYesterdayData(yestJson);
      } else {
        console.error(`[fetchLeaderboard] Dün verisi alınamadı: HTTP ${yestRes.status}`);
      }
    } catch (err) {
      console.error('[fetchLeaderboard] Liderlik tablosu yüklenemedi:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const openLeaderboard = async () => {
    await fetchLeaderboard();
    setShowLeaderboard(true);
  };

  const handleLogin = () => {
    if (username.trim().length < 2) return alert('İsim çok kısa!');
    localStorage.setItem('bandle_username', username.trim());
    setPhase('ready');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // GLOBAL LEADERBOARD MODAL (Her phase'de erişilebilir)
  // ──────────────────────────────────────────────────────────────────────────
  const LeaderboardModal = () => {
    if (!showLeaderboard) return null;
    const activeData = leaderboardTab === 'today' ? leaderboardData : yesterdayData;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div className="bg-[#160022] border border-purple-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-black text-white italic">GAZİNO LİSTESİ</h3>
            <button onClick={() => setShowLeaderboard(false)} className="text-purple-500 text-3xl leading-none">&times;</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setLeaderboardTab('today')}
              className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition ${leaderboardTab === 'today' ? 'bg-purple-600 text-white' : 'bg-purple-950/60 text-purple-400 hover:bg-purple-900/40'}`}
            >
              Bugün
            </button>
            <button
              onClick={() => setLeaderboardTab('yesterday')}
              className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition ${leaderboardTab === 'yesterday' ? 'bg-purple-600 text-white' : 'bg-purple-950/60 text-purple-400 hover:bg-purple-900/40'}`}
            >
              Dün
            </button>
          </div>

          {leaderboardLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            </div>
          ) : activeData.length === 0 ? (
            <p className="text-purple-600 text-center text-sm py-8">Henüz veri yok.</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
              {activeData.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${entry.username === username ? 'bg-purple-700/60 border border-purple-500' : 'bg-purple-950/50'}`}
                >
                  <span className={`w-6 font-black text-xs ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-purple-500'}`}>{i + 1}.</span>
                  <span className="text-white text-sm font-bold flex-1 truncate">{entry.username}{entry.username === username ? ' 👤' : ''}</span>
                  <span className="text-purple-300 font-black">{entry.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // ARAYÜZ (RENDER)
  // ──────────────────────────────────────────────────────────────────────────

  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <style>{animations}</style>
        <LeaderboardModal />
        <div className="w-full max-w-sm text-center">
          <div className="mb-10">
            <div className="text-[10px] tracking-[0.3em] text-purple-400 uppercase mb-3 font-bold">Müzik Tahmin Oyunu</div>
            <h1 className="text-5xl font-black text-white leading-none">DOSTLAR<br /><span className="text-purple-400">GAZİNOSU</span></h1>
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
        <LeaderboardModal />
        <h1 className="text-6xl font-black text-white text-center mb-12">DOSTLAR<br /><span className="text-purple-400">GAZİNOSU</span></h1>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button onClick={() => loadSong(completedCount)} className="bg-purple-500 text-white font-black px-16 py-6 rounded-full text-2xl shadow-lg hover:scale-105 transition-transform">OYUNA BAŞLA</button>
          <button
            onClick={openLeaderboard}
            className="bg-purple-950/60 border border-purple-700 text-purple-300 font-black px-8 py-4 rounded-full text-sm hover:bg-purple-900/60 transition tracking-widest uppercase"
          >
            🏆 Liderlik Tablosu
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d0014] flex flex-col items-center justify-center p-4 gap-8">
        <style>{animations}</style>
        <LeaderboardModal />
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
        <LeaderboardModal />
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
        <LeaderboardModal />
        <div className="w-full max-w-sm space-y-6">
          <div className="bg-[#160022] border border-purple-900 rounded-3xl p-10 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-white mb-2">GÜNLÜK SINIR!</h2>
            <p className="text-purple-500 text-sm mb-8">Bugünlük 3 şarkıyı da bitirdin.</p>
            <div className="mb-8">
              <p className="text-purple-600 text-[10px] uppercase font-bold tracking-widest mb-1">Final Puanın</p>
              <p className="text-6xl font-black text-purple-300">{sessionScore}</p>
            </div>
            <button onClick={openLeaderboard} className="w-full bg-purple-500 text-white font-black py-5 rounded-2xl hover:bg-purple-400 transition">🏆 LİDERLİK TABLOSU</button>
          </div>
        </div>
      </div>
    );
  }

  // ── OYUN EKRANI (PLAYING) ───────────────────────────────────────────────────
  const isPlaying = engineRef.current?.isPlaying ?? false;
  const minutes = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const seconds = String(elapsedSec % 60).padStart(2, '0');
  const currentStemLabel = STEM_LABELS[activeStems[activeStems.length - 1] as StemType] ?? '';

  return (
    <main className="min-h-screen bg-[#0d0014] text-white flex flex-col p-4 font-sans max-w-lg mx-auto w-full">
      <style>{animations}</style>
      <LeaderboardModal />

      {/* Header */}
      <header className="flex justify-between items-center mb-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[8px] text-purple-600 font-bold uppercase tracking-widest">Sahne</span>
          <span className="font-black text-purple-200 text-sm truncate max-w-[80px]">{username}</span>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={openLeaderboard}
            className="bg-purple-950/60 border border-purple-700 text-purple-300 font-black px-2.5 py-1.5 rounded-full text-[9px] hover:bg-purple-900/60 transition tracking-widest uppercase whitespace-nowrap"
          >
            🏆 Sıralama
          </button>
          <div className="text-right">
            <span className="text-[8px] text-purple-600 font-bold uppercase tracking-widest block">Skor</span>
            <p className="font-black text-purple-200 text-sm">{sessionScore}</p>
          </div>
          <div className="bg-purple-900/40 border border-purple-800 px-2 py-1 rounded-full flex items-center text-xs font-black text-purple-300 whitespace-nowrap">
            {completedCount + 1}/{DAILY_LIMIT}
          </div>
        </div>
      </header>

      <h1 className="text-2xl font-black tracking-tight italic text-center mb-3">DOSTLAR GAZİNOSU</h1>

      {/* Şarkı Künyesi (Song Info Panel) */}
      {currentSong && (
        <div className="w-full bg-purple-950/40 border border-purple-500/20 backdrop-blur rounded-xl px-3 py-2 mb-3 flex gap-2 justify-around items-center">
          <div className="flex flex-col items-center flex-1">
            <span className="text-[7px] text-purple-500 font-black uppercase tracking-widest">Yıl</span>
            <span className="text-purple-200 font-black text-xs tracking-widest">{(currentSong as any).releaseYear ?? '—'}</span>
          </div>
          <div className="w-px h-5 bg-purple-700/40" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-[7px] text-purple-500 font-black uppercase tracking-widest">Zorluk</span>
            <span className="text-purple-200 font-black text-xs tracking-widest">
              {DIFFICULTY_LABELS[(currentSong as any).difficulty] ?? (currentSong as any).difficulty ?? '—'}
            </span>
          </div>
          <div className="w-px h-5 bg-purple-700/40" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-[7px] text-purple-500 font-black uppercase tracking-widest">Popülerlik</span>
            <span className="text-purple-200 font-black text-xs tracking-widest">{formatViews((currentSong as any).viewCount)}</span>
          </div>
        </div>
      )}

      {/* Segmented Progress Bar (5 bar, aşama adlı) */}
      <div className="flex gap-1 mb-5">
        {STEM_ORDER.map((stem, i) => {
          const state = guessHistory[i] ?? 'empty';
          return (
            <div
              key={stem}
              className={`flex-1 flex items-center justify-center rounded-md transition-all duration-500 border py-1.5 ${
                state === 'correct'
                  ? 'bg-green-500 border-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]'
                  : state === 'wrong'
                  ? 'bg-red-600 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                  : 'bg-purple-950 border-purple-900'
              }`}
            >
              <span className={`text-[8px] font-black uppercase tracking-tight leading-none text-center px-0.5 ${
                state === 'correct' ? 'text-green-100' : state === 'wrong' ? 'text-red-200' : 'text-purple-700'
              }`}>
                {STEM_LABELS[stem].split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col justify-center w-full space-y-4">
        {/* Timer */}
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
