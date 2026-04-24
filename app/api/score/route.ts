import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, points } = body;

    if (!username || points === undefined) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    // Her şarkı bitiminde yeni bir kayıt oluşturuyoruz.
    // Bu sayede bir kullanıcı günde 3 kayıt bırakmış olacak.
    const newScore = await db.dailyScore.create({
      data: {
        username,
        points: parseInt(points),
      },
    });

    return NextResponse.json(newScore, { status: 201 });
  } catch (error) {
    console.error("Puan kaydedilirken hata:", error);
    return NextResponse.json({ error: "Puan kaydedilemedi" }, { status: 500 });
  }
}