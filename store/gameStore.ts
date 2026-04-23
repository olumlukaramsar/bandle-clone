// store/gameStore.ts
import { create } from 'zustand';
import levenshtein from 'js-levenshtein';

// Oyunun bileşenlerini tanımlıyoruz
interface GameState {
  currentSong: { title: string; artist: string; id: string } | null;
  activeStems: string[]; // O an çalan katmanlar (Örn: ['drums', 'bass'])
  allStemsOrder: string[]; // Tüm sıralama (Örn: ['drums', 'bass', 'synth', 'vocals', 'full'])
  guesses: string[]; // Kullanıcının yaptığı tahminlerin listesi
  currentAttempt: number; // Kaçıncı hakkında? (1-6)
  gameStatus: 'idle' | 'playing' | 'won' | 'lost'; // Oyunun anlık durumu

  // Aksiyonlar (Fonksiyonlar)
  startGame: (song: { title: string; artist: string; id: string }, stemsOrder: string[]) => void;
  submitGuess: (guess: string) => void;
  skipTurn: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  currentSong: null,
  activeStems: [],
  allStemsOrder: ['drums', 'bass', 'synth', 'vocals', 'full'], // Varsayılan sıra
  guesses: [],
  currentAttempt: 1,
  gameStatus: 'idle',

  // 1. Oyunu başlatır ve sadece ilk enstrümanı (örneğin davulu) açar
  startGame: (song, stemsOrder) => set({
    currentSong: song,
    allStemsOrder: stemsOrder,
    activeStems: [stemsOrder[0]], 
    guesses: [],
    currentAttempt: 1,
    gameStatus: 'playing'
  }),

  // 2. Kullanıcı bir tahmin yaptığında çalışır
  submitGuess: (guess) => {
    const state = get();
    if (state.gameStatus !== 'playing' || !state.currentSong) return;

    // Fuzzy Matching (Yazım hatalarını tolere eden kontrol)
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedGuess = normalize(guess);
    const normalizedActual = normalize(state.currentSong.title);

    // Her 5 harf için 1 harf yazım hatasına (tolerans) izin veriyoruz
    const allowedErrors = Math.floor(normalizedActual.length / 5);
    const distance = levenshtein(normalizedGuess, normalizedActual);
    const isCorrect = distance <= Math.max(1, allowedErrors);

    const newGuesses = [...state.guesses, guess];

    if (isCorrect) {
      // Doğru bildi: Oyunu kazan durumuna geçir ve TÜM sesleri aç
      set({
        guesses: newGuesses,
        gameStatus: 'won',
        activeStems: state.allStemsOrder 
      });
    } else {
      // Yanlış bildi: Bir sonraki katmanı aç
      const nextAttempt = state.currentAttempt + 1;
      
      if (nextAttempt > 5) {
        // Hakları bitti
        set({ guesses: newGuesses, gameStatus: 'lost', activeStems: state.allStemsOrder });
      } else {
        // Oyuna devam, yeni enstrüman eklendi
        set({
          guesses: newGuesses,
          currentAttempt: nextAttempt,
          activeStems: [...state.activeStems, state.allStemsOrder[nextAttempt - 1]]
        });
      }
    }
  },

  // 3. Kullanıcı tahminde bulunmayıp "Pas / Geç" dediğinde çalışır
 // store/gameStore.ts içinde skipTurn kısmı böyle olmalı:
skipTurn: () => set((state) => {
  const allStems = ['drums', 'bass', 'synth', 'vocals', 'full'];
  // Şu an kaç enstrüman varsa, bir sonrakini ekle
  const nextIndex = state.activeStems.length;
  
  if (nextIndex < allStems.length) {
    return { 
      activeStems: [...state.activeStems, allStems[nextIndex]] 
    };
  }
  return state;
}),
}));