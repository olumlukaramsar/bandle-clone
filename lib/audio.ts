// lib/audio.ts

export type StemData = {
  name: string; // 'drums', 'bass', 'synth', 'vocals', 'full'
  url: string;
};

export class AudioEngine {
  private context: AudioContext;
  private buffers: Map<string, AudioBuffer> = new Map();
  private sources: Map<string, AudioBufferSourceNode> = new Map();
  private gains: Map<string, GainNode> = new Map();
  private startTime: number = 0;
  private isPlaying: boolean = false;

  constructor() {
    // Tarayıcı uyumluluğu için AudioContext'i başlatıyoruz
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  // 1. Şarkının tüm katmanlarını (stems) arka planda indirip belleğe (Buffer) alır
  async loadStems(stems: StemData[]) {
    const fetchPromises = stems.map(async (stem) => {
      const response = await fetch(stem.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      
      this.buffers.set(stem.name, audioBuffer);
      
      // Her enstrüman için bir ses kontrol düğümü (GainNode) oluşturuyoruz
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0; // Başlangıçta hepsi sessiz (0)
      gainNode.connect(this.context.destination); // Hoparlöre bağla
      this.gains.set(stem.name, gainNode);
    });

    await Promise.all(fetchPromises);
  }

  // 2. Sadece aktif olan (kullanıcının açtığı) katmanların sesiyle şarkıyı başlatır
  play(activeStems: string[]) {
    if (this.isPlaying) return;

    // Eğer AudioContext duraklatılmışsa (tarayıcı politikaları gereği) uyandır
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    this.sources.clear();
    const now = this.context.currentTime;

    this.buffers.forEach((buffer, name) => {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gains.get(name)!);
      
      // BÜTÜN sesleri tam olarak aynı milisaniyede (now) başlatıyoruz
      source.start(now);
      this.sources.set(name, source);

      // Eğer bu katman aktifse sesini aç, değilse sessizde tut
      if (activeStems.includes(name)) {
        this.gains.get(name)!.gain.setValueAtTime(1, now);
      } else {
        this.gains.get(name)!.gain.setValueAtTime(0, now);
      }
    });

    this.startTime = now;
    this.isPlaying = true;
  }

  // 3. Kullanıcı "Geç" veya "Yanlış" yaptığında yeni enstrümanın sesini yumuşakça açar
  revealStem(name: string) {
    const gainNode = this.gains.get(name);
    if (gainNode && this.isPlaying) {
      const now = this.context.currentTime;
      // Ani patlama olmaması için sesi 0.5 saniye içinde 0'dan 1'e çıkarıyoruz (Fade-in)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(1, now + 0.5); 
    }
  }

  // Şarkıyı durdur
  stop() {
    this.sources.forEach(source => source.stop());
    this.isPlaying = false;
  }
}