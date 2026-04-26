"use client";

import { useState, useEffect } from "react";

interface LeaderboardEntry {
  username: string;
  points: number;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<"today" | "yesterday">("today");
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUsername =
    typeof window !== "undefined"
      ? localStorage.getItem("bandle_username") ?? ""
      : "";

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const param = tab === "yesterday" ? "?date=yesterday" : "";
        const res = await fetch(`/api/leaderboard${param}`);
        const json = await res.json();
        setData(json.slice(0, 50));
      } catch (_) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tab]);

  const medalColor = (i: number) => {
    if (i === 0) return "text-yellow-400";
    if (i === 1) return "text-gray-300";
    if (i === 2) return "text-amber-600";
    return "text-purple-600";
  };

  return (
    <div className="min-h-screen bg-[#0d0014] text-white flex flex-col items-center p-6">
      {/* Başlık */}
      <div className="w-full max-w-sm mt-8 mb-6 text-center">
        <p className="text-[10px] tracking-[0.3em] text-purple-400 uppercase font-bold mb-1">
          Dostlar Gazinosu
        </p>
        <h1 className="text-4xl font-black tracking-tight">LİDERLİK TABLOSU</h1>
      </div>

      {/* Tab */}
      <div className="w-full max-w-sm flex bg-purple-950/60 border border-purple-900 rounded-2xl p-1 mb-6">
        {(["today", "yesterday"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${
              tab === t
                ? "bg-purple-500 text-white shadow"
                : "text-purple-500 hover:text-purple-300"
            }`}
          >
            {t === "today" ? "Bugün" : "Dün"}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="w-full max-w-sm space-y-2">
        {loading ? (
          <p className="text-center text-purple-600 text-sm animate-pulse py-10">
            Yükleniyor…
          </p>
        ) : data.length === 0 ? (
          <p className="text-center text-purple-700 text-sm py-10">
            Henüz kayıt yok.
          </p>
        ) : (
          data.map((entry, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                entry.username === currentUsername
                  ? "bg-purple-800 border border-purple-500"
                  : "bg-purple-950/60"
              }`}
            >
              <span className={`text-xs font-black w-5 text-right ${medalColor(i)}`}>
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-bold truncate">{entry.username}</span>
              <span className="text-purple-300 text-sm font-black">{entry.points}</span>
            </div>
          ))
        )}
      </div>

      {/* Geri dön */}
      <a
        href="/"
        className="mt-10 text-purple-600 hover:text-purple-400 text-xs underline underline-offset-4 transition"
      >
        ← Oyuna Dön
      </a>
    </div>
  );
}