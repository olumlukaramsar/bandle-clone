"use client";

import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export default function Home() {
  const { 
    currentSong, 
    activeStems, 
    currentAttempt, 
    gameStatus, 
    startGame, 
    submitGuess, 
    skipTurn 
  } = useGameStore();

  const [guessInput, setGuessInput] = useState('');

  const allStemsOrder = ['drums', 'bass', 'synth', 'vocals', 'full'];

  const handleStartTest = () => {
    startGame(
      { id: "1", title: "Bohemian Rhapsody", artist: "Queen" }, 
      allStemsOrder
    );
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    submitGuess(guessInput);
    setGuessInput(''); 
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-4">
      
      <h1 className="text-4xl font-black mb-2 text-green-400 tracking-wider">BANDLE CLONE</h1>
      <p className="text-neutral-400 mb-8">Şarkıyı en az enstrümanla tahmin et!</p>

      {gameStatus === 'idle' ? (
        <button 
          onClick={handleStartTest}
          className="bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105"
        >
          Oyunu Başlat
        </button>
      ) : (
        <div className="w-full max-w-md bg-neutral-800 p-6 rounded-2xl shadow-2xl flex flex-col gap-6 border border-neutral-700">
          
          <div className="flex justify-between gap-2">
            {allStemsOrder.map((stem, index) => {
              const isActive = activeStems.includes(stem);
              return (
                <div 
                  key={stem} 
                  className={`flex-1 h-12 rounded-lg flex items-center justify-center font-bold text-xs transition-all duration-500 ${
                    isActive ? 'bg-green-500 text-black scale-100 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-neutral-700 text-neutral-500 scale-95'
                  }`}
                >
                  {index + 1}
                </div>
              );
            })}
          </div>

          {gameStatus === 'won' && (
            <div className="text-center text-green-400 font-bold text-xl animate-bounce">
              🎉 Tebrikler! Doğru Bildin: {currentSong?.title}
            </div>
          )}
          {gameStatus === 'lost' && (
            <div className="text-center text-red-400 font-bold text-xl">
              💀 Bilemedin! Şarkı: {currentSong?.title}
            </div>
          )}

          {gameStatus === 'playing' && (
            <form onSubmit={handleGuess} className="flex flex-col gap-3">
              <input
                type="text"
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                placeholder="Şarkı veya sanatçı tahminin..."
                className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-4 text-white focus:outline-none focus:border-green-500 transition-colors"
                autoComplete="off"
              />
              
              <div className="flex gap-3 mt-2">
                <button 
                  type="button"
                  onClick={() => skipTurn()}
                  className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  Geç (+1 Enstrüman)
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg transition-colors"
                >
                  Tahmin Et
                </button>
              </div>
            </form>
          )}

        </div>
      )}

    </main>
  );
}