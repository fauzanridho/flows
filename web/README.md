# Sleep Call P2P — Web Client (Next.js PWA)

Aplikasi klien Web untuk Mac (dan browser modern) yang dirancang khusus untuk sesi panggilan tidur 6–8 jam, hemat baterai, dan always-on sesuai dengan `Blueprint Sleep Call P2P.md` dan `docs/PROTOCOL.md`.

## 🚀 Fitur Utama

- **P2P WebRTC & Perfect Negotiation**: Saling bertukar audio & video langsung antar perangkat tanpa media lewat server signaling.
- **Screen Wake Lock API**: Menjaga layar Mac tetap menyala saat panggilan berlangsung (re-acquired otomatis saat `visibilitychange`).
- **DataChannel `ctrl`**: Sinkronisasi status instan (`muted`, `camera`, `screen`, `mode`, `battery`, `temp`).
- **Opus DTX Optimization**: Menghemat bandwidth audio saat sunyi semalaman (`usedtx=1`, `maxaveragebitrate=24000`, `ptime=40`).
- **Kontrol Independen**:
  - **Mute / Unmute**: Mematikan mikrofon lokal secara instan tanpa renegosiasi WebRTC.
  - **Kamera On / Off**: Mematikan sensor kamera total (lampu LED Mac padam), menghemat panas dan daya.
- **Tiga Mode**:
  - **Normal**: Video 640x480 24fps, audio normal.
  - **Sleep**: Video hemat 320x240 15fps, countdown 10 detik lalu **Blackout `#000000`**.
  - **Deep Sleep**: Audio Opus DTX hemat, kamera mati total, layar blackout.
- **Blackout HUD Peek**:
  - Layar hitam pekat `#000000` dengan `cursor: none`.
  - Video decoder remote dihentikan demi efisiensi prosesor.
  - Gerakkan kursor atau tekan tombol apa pun untuk memunculkan HUD kontrol redup selama 5 detik.
- **PWA Standalone Window**: Dapat di-install sebagai Chrome App / Safari Web App di Dock Mac agar berjalan di jendela mandiri tanpa tab bar.

---

## ⌨️ Pintasan Keyboard (Shortcuts)

| Tombol | Aksi |
|---|---|
| `M` | Toggle Mute / Unmute mikrofon |
| `C` | Toggle Kamera On / Off |
| `1` | Beralih ke **Mode Normal** |
| `2` | Beralih ke **Mode Sleep** (hitung mundur 10 detik ke layar hitam) |
| `3` | Beralih ke **Mode Deep Sleep** (Audio only + layar hitam) |
| `F` | Toggle Fullscreen |
| `D` | Buka / tutup panel statistik WebRTC (RTT, packet loss, candidate type) |

---

## 💻 Tips Menjaga Mac Aktif Semalaman (Overnight)

1. **Jalankan caffeinate di Terminal Mac**:
   ```bash
   caffeinate -i
   ```
   *(Perintah ini mencegah Mac masuk ke idle sleep semalaman saat charger terhubung).*
2. **Sambungkan Charger**: Pastikan MacBook terhubung ke daya.
3. **Biarkan Layar Terbuka** (atau gunakan monitor eksternal untuk Clamshell Mode).

---

## 🛠️ Cara Menjalankan

```bash
# Di direktori /web
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di Chrome atau Safari.
Konfigurasi Signaling Server URL dan Token dapat diubah melalui tombol Pengaturan (⚙️).
