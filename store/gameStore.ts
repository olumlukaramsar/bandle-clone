import { create } from 'zustand';

interface Stem {
  type: string;
  audioUrl: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  stems: Stem[];
}

interface GameState {
  currentSong: Song | null;
  activeStems: string[];
  gameStatus: 'idle' | 'playing' | 'won' | 'lost';
  // Aksiyonlar
  startGame: (song: Song, initialStems: string[]) => void;
  submitGuess: (guess: string) => void;
  skipTurn: () => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentSong: null,
  activeStems: [],
  gameStatus: 'idle',

  startGame: (song, initialStems) => set({
    currentSong: song,
    activeStems: initialStems,
    gameStatus: 'playing'
  }),

  submitGuess: (guess) => set((state) => {
    // Normalizasyon işlemi page.tsx içinde yapıldığı için burada direkt 'won' yapıyoruz
    return { gameStatus: 'won' };
  }),

  skipTurn: () => set((state) => {
    const STEM_ORDER = ['drums', 'bass', 'synth', 'vocals', 'full'];
    const nextIndex = state.activeStems.length;
    
    if (nextIndex < STEM_ORDER.length) {
      return { 
        activeStems: [...state.activeStems, STEM_ORDER[nextIndex]] 
      };
    }
    return { gameStatus: 'lost' };
  }),

  resetGame: () => set({
    currentSong: null,
    activeStems: [],
    gameStatus: 'idle'
  }),
}));