export class AudioEngine {
  private context: AudioContext;
  private buffers: Map<string, AudioBuffer> = new Map();
  private sources: Map<string, AudioBufferSourceNode> = new Map();
  private gains: Map<string, GainNode> = new Map();
  private isPlaying: boolean = false;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async loadStems(stems: { name: string; url: string }[]) {
    // Her yüklemede eski kaynakları temizle
    this.stop();
    
    const fetchPromises = stems.map(async (stem) => {
      try {
        const response = await fetch(stem.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        this.buffers.set(stem.name, audioBuffer);

        const gainNode = this.context.createGain();
        // TEST İÇİN: Başlangıçta 1 yapıyoruz (direkt ses gelsin diye)
        gainNode.gain.value = 1; 
        gainNode.connect(this.context.destination);
        this.gains.set(stem.name, gainNode);
        console.log(`Yüklendi ve Hazır: ${stem.name}`);
      } catch (err) {
        console.error(`${stem.name} yüklenirken hata:`, err);
      }
    });

    await Promise.all(fetchPromises);
  }

// lib/audio.ts içindeki play metodunun başına ekle:
async play(activeStems: string[]) {
  // Bağlantıyı tazele
  if (this.context.state === 'suspended') {
    await this.context.resume();
  }
  
  // ... geri kalan play kodların (bir önceki mesajdaki agresif sürüm kalsın)

    if (!this.isPlaying) {
      this.buffers.forEach((buffer, name) => {
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gainNode = this.gains.get(name);
        if (gainNode) {
          source.connect(gainNode);
          source.start(0);
          this.sources.set(name, source);
        }
      });
      this.isPlaying = true;
    }

    // Ses seviyelerini SIFIR GECİKME ile güncelle
    this.gains.forEach((gainNode, name) => {
      if (activeStems.includes(name)) {
        gainNode.gain.value = 1; 
      } else {
        gainNode.gain.value = 0;
      }
    });
  }

  stop() {
    this.sources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.sources.clear();
    this.isPlaying = false;
  }
}