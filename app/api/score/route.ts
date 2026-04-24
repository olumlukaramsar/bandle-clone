import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Fonksiyon adının BÜYÜK HARFLE "POST" olması zorunludur!
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, points } = body;

    // Veritabanına kaydet
    const newScore = await db.dailyScore.create({
      data: { 
        username, 
        points 
      }
    });

    return NextResponse.json(newScore, { status: 200 });
  } catch (error) {
    console.error("Kayıt hatası:", error);
    return NextResponse.json({ error: "Puan kaydedilemedi" }, { status: 500 });
  }
}