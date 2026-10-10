# Blueprint Sleep Call P2P

Oct 11, 2026 · @Fauzan Ridho

## Ringkasan & Visi

Sleep Call adalah ruang panggilan privat untuk dua orang yang selalu terbuka (drop-in, tanpa dering), dirancang agar bisa menyala 6-8 jam tanpa membuat ponsel panas atau baterai habis.

**Prinsip desain**

- **Tanpa dering**: buka aplikasi, langsung masuk ruang, dan tersambung otomatis begitu partner hadir.
- **Hemat di sumber**: resolusi, frame rate, dan audio diturunkan sebelum di-encode, bukan sesudahnya.
- **Kontrol selalu di tangan**: tombol Mute/Unmute dan Kamera On/Off ala WhatsApp dan Discord ada di semua mode dan semua platform.
- **Privat**: hanya dua orang, terenkripsi (DTLS-SRTP), dan kamera tidak menyala diam-diam.
- **Tahan lama**: koneksi pulih sendiri saat jaringan berpindah atau sinyal putus sesaat.

**Platform target**

| Platform | Teknologi | Peran |
| --- | --- | --- |
| Android | Kotlin, Jetpack Compose, `org.webrtc:google-webrtc`, Foreground Service | Klien utama, tahan layar hitam dan Doze |
| Web Mac | Next.js (PWA), WebRTC browser, Screen Wake Lock | Klien always-on di laptop |
| Android ↔ Android | Aplikasi yang sama di dua ponsel | Mode dua ponsel, tanpa Mac |
| Server | Node.js, Express, Socket.io, coturn | Signaling dan relay TURN, tanpa menyimpan media |

**Istilah kontrol (dipakai konsisten di seluruh dokumen)**

| Tombol | Arti | Efek |
| --- | --- | --- |
| Mute / Unmute | Mikrofon lokal dimatikan atau dinyalakan | Track audio lokal `enabled=false`, partner tidak mendengar kamu. Status terlihat di sisi partner. |
| Kamera On / Off | Kamera lokal dimatikan atau dinyalakan, seperti di WhatsApp dan Discord | Video berhenti dikirim dan capture dihentikan total, jadi sensor mati dan panas turun. Partner melihat placeholder berinisial dengan label "Kamera mati". |
| Layar hitam (otomatis) | Bagian dari mode Sleep dan Deep Sleep, bukan tombol | UI hitam `#000000`, brightness 1%, video remote tidak di-decode. Ketuk dua kali untuk mengintip kontrol. |

Mute dan Kamera adalah dua tombol utama yang berdiri sendiri: Mute hanya memengaruhi suara, Kamera hanya memengaruhi video. Layar hitam hanya memengaruhi perangkat sendiri dan tidak memutus panggilan.

## Arsitektur Sistem

Media mengalir langsung antar perangkat (atau lewat relay TURN bila terpaksa), sedangkan server hanya mempertemukan kedua pihak.

&#91;embedded content: arsitektur · 4 komponen, 2 jalur media\]

Garis tebal adalah jalur media langsung. Garis putus-putus adalah relay TURN yang hanya dipakai bila jalur langsung gagal. Signaling tidak pernah dilalui media.

**Peran komponen**

| Komponen | Peran | Teknologi |
| --- | --- | --- |
| Signaling | Mendaftarkan peserta, meneruskan SDP dan ICE candidate, menerbitkan kredensial TURN. Tidak menyentuh media. | Node.js, Express, Socket.io. Alternatif: Cloudflare Worker + Durable Object (WebSocket). Wajib always-on, bukan tier yang tidur. |
| STUN | Membantu klien menemukan alamat publiknya | coturn atau STUN publik |
| TURN | Relay saat P2P gagal. Di jaringan seluler Indonesia (CGNAT) ini sering terjadi, jadi bukan opsional. | coturn di VPS (dengan TLS di port 443), atau layanan terkelola |
| Hosting web | Menyajikan klien Mac lewat HTTPS (wajib agar kamera dan mikrofon bisa diakses) | Next.js di hosting statis atau serverless |

**Jalur koneksi**

1. Klien menghubungi signaling dengan token dan menerima daftar `iceServers`.
2. Offer, answer, dan ICE candidate dipertukarkan lewat signaling.
3. ICE mencoba jalur langsung (host), lalu alamat publik (STUN), lalu relay (TURN) bila perlu.
4. Media SRTP dan data channel `ctrl` mengalir langsung antar peer, atau lewat TURN bila jalur langsung gagal.
5. Setelah tersambung, signaling hanya dipakai untuk ICE restart dan sebagai cadangan pesan status.

## Drop-in Room & Keamanan

Satu room permanen berisi maksimal dua peserta, dan hanya pemegang token yang bisa masuk.

**Alur masuk room**

1. Klien membuka `wss://` ke server signaling dengan token di handshake, lalu mengirim `join-room`.
2. Server memeriksa token dan jumlah peserta (maksimal 2), lalu membalas `joined` berisi peran dan daftar peer.
3. Peserta pertama menunggu sendirian. Mikrofon aktif, kamera mengikuti pengaturan tersimpan (default OFF).
4. Saat peserta kedua masuk, server mengirim `peer-joined` ke keduanya. Peserta yang sudah lebih dulu ada berperan impolite dan membuat offer. Pendatang baru berperan polite dan mengalah bila terjadi bentrok offer.
5. Tidak ada tombol terima. Audio langsung tersambung, video mengikuti mode yang aktif.

**Pengaman room**

- **Token rahasia** minimal 32 karakter acak, dikirim lewat `auth` Socket.io (bukan di URL), disimpan di Android Keystore atau penyimpanan browser setelah dimasukkan sekali. Token diganti lewat environment server.
- **Hanya `wss://`**, dengan whitelist origin untuk klien web dan rate limit percobaan join. Token salah berarti koneksi diputus dan percobaan berikutnya ditunda.
- **Maksimal 2 peserta.** Join dari `deviceId` yang sama menendang sesi lama, jadi tidak ada sesi hantu.
- **Kamera tidak menyala diam-diam.** Default OFF saat auto-join. Pengaturan opsional "Nyalakan kamera otomatis saat partner hadir" bisa diaktifkan di dua perangkat tepercaya.
- **Indikator selalu terlihat**: ikon kamera/mikrofon aktif di UI, plus notifikasi Foreground Service permanen di Android.
- **Enkripsi media** DTLS-SRTP langsung antar peer. Server TURN hanya meneruskan paket terenkripsi dan tidak bisa mendekripsinya.

**Ketahanan koneksi (target 6-8 jam)**

| Kejadian | Respons |
| --- | --- |
| Socket.io putus | Reconnect dengan backoff 1 detik sampai 30 detik, join ulang dengan `deviceId` sama. Media yang sudah tersambung tetap berjalan. |
| `iceConnectionState` `disconnected` lebih dari 5 detik, atau `failed` | ICE restart otomatis lewat `restartIce()` dengan offer baru. |
| Pindah WiFi ke LTE (atau sebaliknya) | ICE restart otomatis, audio sempat jeda lalu pulih tanpa aksi pengguna. |
| Offer saling bentrok (glare) | Perfect negotiation: peer polite melakukan rollback, impolite menang. |
| Partner keluar | UI menampilkan "Partner offline". Pengiriman video dihentikan agar hemat baterai, heartbeat tetap berjalan. |
| Server signaling restart | Klien reconnect dan negosiasi ulang bila PeerConnection tidak lagi `connected`. |
| Mac tidur atau tab dibekukan | Wake Lock mencegahnya. Bila tetap terjadi, klien reconnect otomatis saat Mac bangun. |

## Mode Sleep & Kontrol Pengguna

Tiga mode mengatur apa yang dikirim dan diterima, sedangkan tombol Mute dan Kamera bekerja terpisah dari mode, jadi selalu bisa dipakai.

**Tiga mode**

| Mode | Kirim | Terima | Layar | Dipakai saat |
| --- | --- | --- | --- | --- |
| Normal | Video + audio | Video + audio | Normal | Ngobrol, saling melihat |
| Sleep | Video low-res (opsional) + audio DTX | Audio saja | Blackout otomatis | Mulai tidur, masih ingin terlihat |
| Deep Sleep | Audio DTX saja | Audio saja | Blackout | Tidur nyenyak, baterai rendah, atau perangkat panas |

Memilih Sleep atau Deep Sleep memulai hitung mundur 10 detik sebelum layar menjadi hitam (ketuk untuk membatalkan). Memilih Normal langsung menghidupkan layar.

&#91;embedded content: transisi mode · 3 mode, 1 jalur paksa\]

Perpindahan mode bisa dipilih bebas lewat tombol. Yang otomatis hanya turun: timer Sleep dan perlindungan perangkat. Mute tidak ikut berubah saat mode berpindah. Deep Sleep mematikan kamera, dan naik kembali ke Sleep atau Normal memulihkan kamera hanya bila pengguna tidak mematikannya sendiri.

**Kontrol pengguna**

| Kontrol | Cara kerja | Terlihat oleh partner |
| --- | --- | --- |
| Mute / Unmute | Track audio lokal diubah `enabled=false` atau `true`. Tidak ada renegosiasi, sender tetap ada, jadi pindah status instan. | Ikon mikrofon dicoret di sisi partner |
| Kamera On / Off | Off: capture dihentikan total (`stopCapture()` di Android, `track.stop()` di web), lampu kamera padam dan sensor berhenti. On: capture dimulai lagi dengan resolusi dan fps sesuai mode aktif. | Placeholder berinisial dan label "Kamera mati", seperti di WhatsApp |
| Layar hitam (otomatis, ikut mode) | Aktif bersama Sleep dan Deep Sleep: overlay `#000000`, brightness 1%, video remote tidak di-decode (`remoteVideoTrack.setEnabled(false)`, renderer dilepas). Panggilan dan audio tetap jalan. | Label "Layar partner mati" |

**Cara mengakses kontrol saat layar hitam**

Di layar hitam seluruh tombol tersembunyi supaya tidak silau dan tidak tersentuh tak sengaja.

- **Android**: ketuk dua kali di mana saja memunculkan panel kontrol redup (Mute, Kamera, mode) selama 5 detik. Aksi **Mute** dan **Kamera** juga ada di notifikasi Foreground Service, jadi bisa dipakai tanpa membuka aplikasi.
- **Web Mac**: gerakkan mouse atau tekan tombol apa pun untuk mengintip kontrol. Pintasan: `M` untuk Mute/Unmute, `C` untuk Kamera On/Off, `1` `2` `3` untuk mode.
- Panel kontrol di layar hitam berwarna abu gelap (opasitas rendah) dan tombolnya besar, agar mudah ditekan setengah sadar.

**Aturan interaksi**

- Status Mute dan Kamera disimpan dan dipulihkan setelah reconnect atau ICE restart. Pengguna yang sedang mute tidak pernah tiba-tiba terdengar, dan kamera yang sengaja dimatikan tidak menyala sendiri setelah sinyal pulih.
- Mute tidak mengubah mode. Di Deep Sleep, audio DTX plus mute membuat trafik hampir nol, tetapi koneksi tetap hidup lewat keep-alive RTCP.
- Mematikan kamera tidak mengubah mode, hanya menghentikan pengiriman video dan menghemat panas.
- Thermal guard hanya memaksa Deep Sleep dan mematikan kamera. Ia tidak pernah mengubah status Mute.
- Layar yang dibangunkan sementara (ketuk dua kali) kembali hitam setelah 30 detik tanpa sentuhan (dapat diubah di pengaturan).
- Sleep timer: setelah N menit (default 30) Sleep otomatis naik ke Deep Sleep, dengan peringatan suara pelan ke partner.

**Sinkronisasi status ke partner**

Status dikirim lewat RTCDataChannel `ctrl` (tanpa melewati server), berisi `muted`, `camera`, `screen`, `mode`, `battery`, dan `temp`. Dikirim saat berubah dan sebagai heartbeat setiap 30 detik. Bila data channel tertutup, klien jatuh ke event `state` lewat signaling sebagai cadangan.

## Optimasi Media & Hardware

Panas dan baterai ditekan dari sumbernya: sensor kamera dulu, lalu encoder, baru jaringan.

**Parameter per mode** (angka usulan, perlu diuji di perangkat asli)

| Parameter | Normal | Sleep | Deep Sleep |
| --- | --- | --- | --- |
| Capture kamera | 640x480, 24 fps | 320x240, 10-15 fps | Mati |
| Bitrate video maks | 600 kbps | 150-200 kbps | Tidak ada |
| Codec video | H.264 hardware | H.264 hardware | Tidak ada |
| Audio Opus | 32 kbps | 24 kbps + DTX | 16-24 kbps + DTX |
| Decode video remote | Ya | Tidak | Tidak |

**Lima lapisan optimasi (urut dari paling berpengaruh)**

1. **Turunkan capture di sumber.** Android: `videoCapturer.changeCaptureFormat(320, 240, 15)`. Web: `track.applyConstraints({ width: 320, height: 240, frameRate: 15 })`. Mengecilkan hasil encode saja tidak cukup, sensor yang tetap menangkap 720p inilah yang memanaskan.
2. **Batasi sender tanpa renegosiasi.** Lewat `RTCRtpSender.setParameters` (Android: `RtpParameters.Encoding`), atur `maxBitrate`, `maxFramerate`, dan `scaleResolutionDownBy`. Sebagai lapisan kedua, bukan pengganti lapisan 1.
3. **Kunci codec H.264 hardware.** Android: `DefaultVideoEncoderFactory(eglContext, false, false)` bersama `HardwareVideoDecoderFactory`, profile constrained baseline `42e01f` agar cocok dengan Chrome dan Safari di Mac. Di web, gunakan `transceiver.setCodecPreferences()` lebih dulu, dan SDP munging hanya sebagai cadangan.
4. **Audio hemat paket.** fmtp Opus: `usedtx=1;useinbandfec=1;stereo=0;maxaveragebitrate=24000;ptime=40`. Mono dan ptime panjang mengurangi jumlah paket. Noise suppression dan echo cancellation tetap ON, karena kipas atau AC yang terus berbunyi akan mengalahkan DTX.
5. **Matikan kerja di sisi penerima.** Saat layar hitam aktif, video remote tidak di-decode dan tidak dirender. Trafik masuk baru berkurang bila pengirim ikut berhenti mengirim video, jadi layar hitam juga mengirim pesan permintaan audio-only ke partner (lihat pesan `req` di bagian protokol).

**Perlindungan perangkat**

| Pelindung | Pemicu | Tindakan |
| --- | --- | --- |
| Thermal guard | Suhu baterai 40°C atau status thermal `MODERATE` | Turun satu tingkat mode, kamera off, notifikasi ke partner |
| Thermal guard keras | Suhu 42°C atau status thermal `SEVERE` | Langsung Deep Sleep, kamera off |
| Baterai rendah | Di bawah 15% dan tidak mengisi | Deep Sleep otomatis |
| Baterai kritis | Di bawah 5% | Beri tahu partner, tutup panggilan dengan rapi |
| Motion-gated video (opsional, Sleep) | Tidak ada gerakan lebih dari 60 detik | `encoding.active=false`, aktif lagi saat ada gerakan |
| Sensor telungkup (opsional) | Proximity dekat dan cahaya hampir nol | Kamera off sementara |

Suhu dibaca dari `BatteryManager.EXTRA_TEMPERATURE` (satuan persepuluh °C) dan `PowerManager.addThermalStatusListener` (Android 10+). Setelah turun karena panas, mode tidak naik lagi otomatis. Pengguna harus memilihnya, supaya tidur tidak terganggu lonjakan panas berulang. Ambang di atas adalah titik awal, bukan angka baku.

Deteksi gerakan memakai selisih frame di resolusi sangat kecil (64x48, sekali per detik) dengan ambang adaptif, karena noise kamera di ruangan gelap mudah memicu false positive.

**Observabilitas**

Panel stats opsional membaca `getStats()` setiap 5 detik, hanya saat panel terbuka: bitrate, RTT, packet loss, jitter, tipe kandidat (host, srflx, relay), dan `encoderImplementation`. Field terakhir penting untuk memastikan encoder benar-benar hardware (misalnya MediaCodec) dan bukan software.

## Spesifikasi Klien Android

Keberhasilan klien Android ditentukan oleh Foreground Service dan perilaku tiap pabrikan, bukan oleh kode WebRTC-nya.

**Komponen**

| Komponen | Tugas |
| --- | --- |
| `CallService` (Foreground Service, tipe `camera\|microphone`) | Memegang PeerConnection, capturer, dan audio. Tetap hidup saat Activity ditutup atau layar hitam. |
| `CallActivity` (Jetpack Compose) | UI normal, overlay blackout, panel kontrol. |
| `SignalingClient` | Klien Socket.io, reconnect dengan backoff, event join dan negosiasi. |
| `CallController` | Pemegang state (`StateFlow`): mode, mute, kamera, layar, suhu, baterai. Satu-satunya sumber kebenaran untuk UI dan notifikasi. |
| `PowerGuard` | Thermal guard, pemantau baterai, wake lock, WifiLock. |
| `AudioRouter` | Fokus audio dan routing speaker, earpiece, Bluetooth (AudioSwitch). |

**Manifest dan izin**

- Izin: `INTERNET`, `CAMERA`, `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE` (wajib Android 14+), `POST_NOTIFICATIONS` (Android 13+), `WAKE_LOCK`, `ACCESS_WIFI_STATE`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH_CONNECT` (Android 12+), `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- Service dideklarasikan `android:foregroundServiceType="camera|microphone"`.
- Service dimulai dari Activity yang sedang tampil. Android 12+ menolak start FGS kamera atau mikrofon dari background.
- Jika memakai pustaka WebRTC, periksa dulu `org.webrtc:google-webrtc`: artefak itu sudah lama tidak diperbarui. Build yang masih dirawat, misalnya `io.github.webrtc-sdk:android`, lebih aman untuk proyek baru (cek versi terbaru sebelum memilih).

**Notifikasi Foreground Service**

Notifikasi ongoing berprioritas rendah dengan tiga aksi: **Mute / Unmute**, **Kamera On / Off**, dan **Akhiri**. Dengan ini kedua tombol utama bisa dipakai tanpa membuka aplikasi, dan teksnya mengikuti state `CallController`. Bila Android menolak menyalakan kamera dari latar belakang, aksi Kamera On membuka aplikasi lebih dulu.

**Layar hitam (blackout) di Compose**

- State `screenOff` di `CallController`. Saat true, Compose menggambar satu `Box` hitam `#000000` seluruh layar tanpa elemen lain, ditambah penangkap ketukan dua kali untuk memunculkan panel kontrol redup selama 5 detik.
- Brightness jendela: `screenBrightness = 0.01f`. Saat Hidupkan Layar dikembalikan ke `BRIGHTNESS_OVERRIDE_NONE`.
- `FLAG_KEEP_SCREEN_ON` tetap aktif selama ada video, dan mode immersive menyembunyikan status bar dan navigation bar.
- Layar sengaja tidak dimatikan sungguhan. Banyak pabrikan menghentikan kamera saat layar mati, sedangkan piksel hitam di OLED hampir tidak memakai daya.
- Opsi untuk Deep Sleep (kamera off): lepas `FLAG_KEEP_SCREEN_ON` agar layar mati alami oleh sistem. Audio tetap hidup lewat Foreground Service. Fitur ini perlu diuji di HP yang dipakai.
- Saat layar hitam berakhir (kembali ke mode Normal atau panel kontrol dibuka), renderer remote dipasang lagi dan track video remote diaktifkan lagi.

**Wake lock dan jaringan**

- `PARTIAL_WAKE_LOCK` selama panggilan, dengan timeout pengaman yang diperbarui berkala, dilepas saat panggilan berakhir.
- `WifiLock` mode `WIFI_MODE_FULL_LOW_LATENCY` (API 29+, cadangan `HIGH_PERF`).
- Onboarding sekali jalan: minta pengecualian battery optimization, lalu pandu pengguna ke pengaturan autostart dan "tanpa batasan baterai" untuk Xiaomi, Oppo, Vivo, Realme, dan Samsung, plus kunci aplikasi di recent apps. Checklist ini muncul lagi bila service terdeteksi dimatikan sistem.

**Audio**

- `AudioManager.MODE_IN_COMMUNICATION`, audio focus `AUDIOFOCUS_GAIN`, routing lewat AudioSwitch.
- `JavaAudioDeviceModule` dengan echo canceler dan noise suppressor hardware bila tersedia.
- Mute memakai `localAudioTrack.setEnabled(false)`. Telepon GSM yang masuk otomatis me-mute panggilan dan memulihkannya setelah selesai.

**Penyimpanan lokal**

DataStore menyimpan token, `deviceId`, mode terakhir, dan pengaturan (kamera otomatis, timeout layar, ambang suhu). Token disimpan terenkripsi (Android Keystore).

## Spesifikasi Klien Web Mac

Klien Mac adalah Next.js PWA di Chrome atau Safari, dengan tombol dan perilaku yang sama seperti Android, ditambah penjagaan agar Mac tidak tidur.

**Struktur aplikasi**

- Satu halaman `/call` sebagai client component. Hook `useCall()` memegang `RTCPeerConnection`, socket, dan state (mode, mute, kamera, layar).
- PWA dengan manifest dan service worker minimal, dipasang sebagai jendela mandiri. Jendela terpisah tidak tercampur tab lain dan lebih jarang dibekukan browser.
- Deteksi fitur sebelum dipakai: `navigator.wakeLock` (Safari 16.4+), `setCodecPreferences`, `getStats`.

**Menjaga Mac tetap hidup semalaman**

| Lapisan | Cara | Catatan |
| --- | --- | --- |
| Screen Wake Lock API | `navigator.wakeLock.request('screen')` | Diminta ulang saat `visibilitychange`. Dilepas saat Matikan Layar bila opsi "biarkan layar Mac padam" aktif. |
| Cegah idle sleep sistem | `caffeinate -i` di Terminal (tambah `-s` bila tersambung charger) | Tanpa `-d`, supaya layar tetap boleh padam saat Matikan Layar. |
| Tutup lid | Hindari | Mac tidur saat lid ditutup kecuali clamshell mode (butuh monitor eksternal dan charger). |
| Memory Saver / tab discarding | Pakai jendela PWA dan kecualikan situs dari Memory Saver | Panggilan WebRTC yang aktif biasanya tidak dibekukan, tetapi tab latar tanpa audio bisa. |
| Daya | Charger tersambung, peringatan di UI bila baterai di bawah 20% | Mac juga bisa panas bila kamera dan video aktif semalaman. |

**Layar hitam di web (bagian dari mode Sleep)**

- Saat Sleep atau Deep Sleep aktif: overlay `position: fixed; inset: 0; background: #000; cursor: none`, elemen `<video>` remote dijeda dan `srcObject` dilepas, track video remote `enabled = false`. Panggilan dan audio tidak tersentuh.
- Browser tidak bisa mengubah brightness layar Mac, jadi blackout hitam penuh adalah efek yang tersedia. Kecerahan fisik bisa diturunkan manual.
- Gerakkan mouse atau tekan tombol apa pun untuk mengintip kontrol. Kembali ke mode Normal menutup overlay, memasang video lagi, dan meminta ulang wake lock.
- Perlu diuji: apakah kamera Mac tetap aktif saat display sleep terjadi setelah wake lock dilepas. Bila tidak, pakai blackout overlay dengan wake lock tetap aktif.

**Mute dan kamera di web**

- Mute: `audioTrack.enabled = false`, Unmute: `true`. Tanpa renegosiasi.
- Kamera Off: `videoTrack.stop()` sehingga lampu kamera padam dan sensor berhenti. Kamera On: `getUserMedia` ulang lalu `sender.replaceTrack(newTrack)`, juga tanpa renegosiasi.

**Tata letak UI**

- Video remote besar, preview lokal kecil di pojok, status partner (online, offline, kamera mati, mute). Partner dengan kamera mati tampil sebagai placeholder berinisial.
- Bar kontrol: **Mute**, **Kamera**, pemilih mode (Normal, Sleep, Deep Sleep), dan **Akhiri**.
- Indikator koneksi (host, srflx, relay, dan RTT) serta panel stats yang bisa dibuka.
- Pintasan: `M` mute, `C` kamera, `1` `2` `3` mode.

## Protokol Signaling & Pesan Kontrol

Server hanya menyampaikan pesan negosiasi, sedangkan status Mute, Layar, dan mode berjalan langsung antar perangkat lewat data channel.

**Event Socket.io**

| Arah | Event | Isi | Fungsi |
| --- | --- | --- | --- |
| Klien ke server | `join-room` | `deviceId`, `platform`, `appVersion` | Masuk room (token ada di `auth` handshake) |
| Klien ke server | `signal` | `kind` (`offer`, `answer`, `candidate`), `data` | Diteruskan ke peer apa adanya |
| Klien ke server | `state` | `muted`, `camera`, `screen`, `mode` | Cadangan bila data channel belum terbuka |
| Klien ke server | `leave-room` | kosong | Keluar dengan rapi |
| Server ke klien | `joined` | `role` (`polite` atau `impolite`), `peers`, `iceServers` | Balasan join, termasuk kredensial TURN sementara |
| Server ke klien | `peer-joined` | `deviceId`, `platform` | Memicu negosiasi |
| Server ke klien | `peer-left` | `deviceId` | Partner keluar atau terputus |
| Server ke klien | `signal`, `state` | sama seperti di atas | Relay dari partner |
| Server ke klien | `error` | `code`: `bad-token`, `room-full`, `replaced` | Penolakan atau sesi digantikan |

**Kredensial TURN sementara**

Server membuat username dan password TURN berbatas waktu (HMAC dari shared secret coturn, mode `use-auth-secret`) dan mengirimkannya di `joined`. Masa berlaku minimal 12 jam agar satu malam penuh aman. Reconnect mendapat kredensial baru, jadi tidak ada password TURN permanen di aplikasi.

**Pesan data channel `ctrl`** (ordered, reliable, dibuat oleh peer impolite)

| Pesan | Isi | Fungsi |
| --- | --- | --- |
| `state` | `muted`, `camera`, `screen`, `mode`, `battery`, `temp`, `ts` | Menampilkan status partner. Dikirim saat berubah dan tiap 30 detik. |
| `req` | `want`: `audio-only` atau `video` | Meminta pengirim berhenti atau mulai mengirim video (hemat trafik saat layar penerima mati) |
| `notice` | `code`: `thermal-down`, `battery-low`, `timer-deep`, `partner-muted` | Pemberitahuan singkat ke partner |
| `ping` | `ts` | Heartbeat dan pengukur latensi kontrol |

**Contoh pesan**

```json
{"t":"state","muted":true,"camera":false,"screen":false,"mode":"deep-sleep","battery":62,"temp":36.4,"ts":1760130000000}
```

**Aturan penanganan**

- Tombol Mute tidak menunggu konfirmasi partner. Efek lokal instan, pesan `state` menyusul.
- Pesan `req` dikirim otomatis saat layar hitam aktif (`audio-only`) dan saat layar hitam berakhir (`video`). Pengirim boleh menolak bila ia sendiri sedang Deep Sleep.
- Pesan dengan `ts` lebih lama dari `state` terakhir diabaikan, supaya urutan acak tidak mengembalikan status lama.

## Roadmap, Pengujian & Risiko

Fokus saat ini hanya Android ke Android (dua ponsel, aplikasi yang sama). Risiko terbesar diuji lebih awal: apakah koneksi lolos di jaringan seluler asli dan apakah kamera bertahan saat layar hitam. Klien Mac native menyusul setelah protokol terbukti stabil.

### Roadmap

Sembilan tahap, masing-masing berakhir di satu gerbang yang harus lulus sebelum lanjut. Tahap 8 (Mac) sengaja ditunda.

&#91;embedded content: roadmap · 9 tahap, 2 tahap server\]

Server dibangun dua kali dengan sengaja: versi minimal (tahap 1) cukup untuk membuktikan koneksi di tahap 2, dan baru dilengkapi (tahap 3) setelah jalur jaringan terbukti. Tahap 5 menentukan apakah Sleep Mode memakai video atau cukup audio saja.

**Rincian tahap**

Hasil kerja, prompt siap pakai, dan kriteria selesai tiap tahap ada di bagian Panduan Build (Vibe Coding) di akhir dokumen ini.

Asumsi saat ini: signaling di Cloudflare Worker + Durable Object dengan WebSocket JSON polos, dan TURN terkelola. Bagian lain dokumen (Socket.IO, klien Web Mac) masih mengikuti rencana lama dan akan diselaraskan bila asumsi ini disetujui.

### Estimasi pemakaian data (8 jam, per arah)

| Skenario | Bitrate total | Data |
| --- | --- | --- |
| Normal: video 600 kbps + audio 32 kbps | 632 kbps | sekitar 2,3 GB |
| Sleep: video 200 kbps + audio 24 kbps | 224 kbps | sekitar 806 MB |
| Sleep: video 150 kbps + audio 24 kbps | 174 kbps | sekitar 626 MB |
| Deep Sleep: audio 24 kbps | 24 kbps | sekitar 86 MB |
| Deep Sleep: audio 16 kbps | 16 kbps | sekitar 58 MB |

Angka di atas batas atas. DTX menurunkan pemakaian audio saat sunyi. Bila panggilan lewat relay TURN, server memproses trafik kedua arah, sehingga kuota VPS ikut terpakai.

### Checklist pengujian

- [ ] Spike: browser ke browser lewat TURN di jaringan seluler asli (WiFi dan LTE, kedua sisi)
- [ ] Kamera Android tetap aktif saat blackout (uji minimal 1 jam dengan `FLAG_KEEP_SCREEN_ON`)
- [ ] Mute: partner tidak mendengar apa pun, dan status mute tetap setelah reconnect
- [ ] Kamera On / Off dari panel, notifikasi (Android), dan pintasan (Mac): partner melihat placeholder, lalu video kembali tanpa glitch saat kamera dinyalakan
- [ ] Pindah WiFi ke LTE saat panggilan: koneksi pulih sendiri tanpa aksi pengguna
- [ ] Doze: layar hitam beberapa jam, panggilan Android tidak putus
- [ ] Telepon masuk: otomatis mute dan pulih setelah selesai
- [ ] Mac tidak tidur selama semalam dengan `caffeinate -i` dan Wake Lock
- [ ] Thermal guard turun mode pada ambang uji, dan partner menerima notifikasi
- [ ] Uji semalam penuh: catat suhu dan baterai tiap jam, bitrate rata-rata, jumlah ICE restart

### Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Pabrikan menghentikan kamera saat layar mati | Video putus | Blackout overlay (layar tetap menyala), uji lebih awal, fallback audio-only |
| Foreground Service dimatikan sistem | Panggilan putus | Onboarding autostart dan battery optimization, deteksi lalu restart dan reconnect otomatis |
| CGNAT memblokir P2P | Gagal tersambung | TURN wajib, siapkan TURN over TLS di port 443 sebagai cadangan |
| Panas semalaman | Perangkat melambat, baterai cepat turun | Capture 320x240, thermal guard, Deep Sleep |
| Mac tidur | Panggilan putus | Wake Lock, `caffeinate -i`, reconnect otomatis |
| Token bocor | Orang asing masuk room | Token panjang, rotasi, batas 2 peserta, kamera default OFF |
| Pustaka WebRTC Android usang | Bug dan masalah kompatibilitas | Pakai build yang dirawat, kunci versi |
| Kuota data seluler habis | Panggilan berhenti di tengah malam | Deep Sleep, tampilkan perkiraan pemakaian data |

## Panduan Build (Vibe Coding)

Satu tahap per sesi AI, dan sebuah tahap selesai hanya bila gerbangnya diuji di perangkat asli.

**Aturan kerja**

- Satu repo dengan tiga bagian: `server/`, `android/`, dan `docs/PROTOCOL.md`.
- `PROTOCOL.md` adalah kontrak antara server dan klien. Tempel di awal setiap sesi AI, dan ubah dokumennya dulu sebelum mengubah kode. Bila AI mengubah pesan protokol sendiri, tolak dan minta ia mengikuti dokumen.
- Satu tahap per sesi. Minta AI membuat file satu per satu, jalankan, lalu tempel pesan error apa adanya.
- Setiap tahap selesai: uji gerbangnya, commit, lalu beri tag (`git tag tahap-1`) supaya mudah kembali bila tahap berikutnya merusak sesuatu.
- Uji di ponsel asli, bukan emulator. Kamera, Doze, dan jaringan seluler tidak terwakili emulator.
- Rahasia (token, kunci TURN) disimpan lewat `wrangler secret` di server dan `local.properties` di Android, jangan di-commit.
- Awal tiap sesi, tempel tiga hal: ringkasan satu paragraf proyek, `PROTOCOL.md`, dan status tahap sebelumnya.
- Jangan meminta "bangun semuanya sekaligus" dan jangan melompati tahap.

### Tahap 0: Repo dan kontrak protokol

Tujuan: menetapkan bentuk pesan sebelum ada kode.

Prompt:

```text
Buat docs/PROTOCOL.md untuk signaling WebRTC lewat WebSocket JSON polos (satu room tetap bernama private-sleep-room, maksimal 2 peserta). Autentikasi: header Authorization: Bearer <token> saat upgrade WebSocket; token salah ditolak HTTP 401.

Pesan klien ke server (semua JSON dengan field "type"): join {deviceId, platform, appVersion}; signal {kind: offer|answer|candidate, data}; state {muted, camera, screen, mode}; leave; ping.
Pesan server ke klien: joined {role: polite|impolite, peers, iceServers}; peer-joined {deviceId, platform}; peer-left {deviceId}; signal (diteruskan apa adanya); state (diteruskan); error {code: bad-token|room-full|replaced|bad-message}; pong.

Aturan: peserta pertama berperan impolite dan membuat offer, peserta kedua polite. deviceId yang sama bergabung ulang menendang sesi lama dengan error replaced. Tulis contoh JSON untuk tiap pesan dan urutan pesan untuk kasus: dua peserta masuk, salah satu keluar, reconnect.
```

Selesai bila `PROTOCOL.md` tersimpan di repo dan kamu sudah membacanya sampai paham, karena semua tahap berikutnya mengikuti dokumen ini.

### Tahap 1: Server minimal

Tujuan: server yang cukup agar dua klien uji bisa saling bertukar signal.

Prompt:

```text
Ikuti docs/PROTOCOL.md. Buat Cloudflare Worker (TypeScript, wrangler) dengan satu Durable Object bernama Room untuk signaling WebRTC.

- GET /ws meng-upgrade ke WebSocket. Periksa header Authorization: Bearer terhadap secret ROOM_TOKEN, balas 401 bila salah.
- Semua koneksi diarahkan ke satu Durable Object dengan nama tetap private-sleep-room. Pakai migrasi new_sqlite_classes di wrangler.toml (wajib di paket gratis).
- Gunakan WebSocket Hibernation API (ctx.acceptWebSocket) dan simpan deviceId serta role di serializeAttachment.
- Batas 2 koneksi; yang ketiga menerima error room-full lalu ditutup.
- join dibalas joined (peserta pertama impolite, kedua polite, iceServers kosong dulu). Saat peserta kedua masuk, kirim peer-joined ke keduanya.
- signal dan state diteruskan ke peer lain tanpa diubah. Saat koneksi tutup, kirim peer-left ke peer lain.
- Balas ping dengan pong lewat setWebSocketAutoResponse agar koneksi idle tidak membangunkan Durable Object.
Tulis wrangler.toml, src/index.ts, dan README singkat cara menjalankan dan deploy. Jangan menambah fitur di luar daftar ini.
```

Gerbang:

- [ ] `wrangler dev` berjalan, dan dua sesi `wscat` dengan token benar saling menerima `peer-joined` dan `signal`
- [ ] Token salah ditolak 401, dan klien ketiga menerima `room-full`
- [ ] `wrangler deploy` berhasil dan URL `wss://` bisa diakses dari data seluler

### Tahap 2: Android spike

Tujuan: membuktikan dua ponsel bisa tersambung di jaringan seluler asli sebelum menulis fitur lain.

Prompt:

```text
Buat proyek Android baru (Kotlin, Jetpack Compose, minSdk 26) berisi satu layar untuk menguji koneksi WebRTC dua ponsel. Ikuti docs/PROTOCOL.md.

- Dependensi: library WebRTC Android yang masih dirawat (io.github.webrtc-sdk:android, pakai versi stabil terbaru) dan OkHttp untuk WebSocket.
- Izin CAMERA dan RECORD_AUDIO diminta saat runtime.
- Layar berisi tombol Join dan Leave, dua tampilan video (lokal kecil, remote besar) memakai SurfaceViewRenderer di dalam AndroidView, dan teks status koneksi.
- PeerConnectionFactory memakai DefaultVideoEncoderFactory dan DefaultVideoDecoderFactory dengan H.264 hardware didahulukan.
- Join: buka WebSocket ke URL server dengan header Authorization Bearer, kirim join, lalu tangani joined, peer-joined, signal, dan peer-left sesuai protokol, termasuk perfect negotiation (peer polite melakukan rollback bila offer bentrok).
- iceServers sementara diisi statis dari BuildConfig (URL dan kredensial TURN dibaca dari local.properties, tidak di-commit).
- Tampilkan di layar: iceConnectionState dan tipe kandidat terpilih (host, srflx, atau relay) dari getStats.
Belum ada Foreground Service, Sleep Mode, Mute, atau notifikasi. Satu Activity saja.
```

Gerbang:

- [ ] Dua ponsel terhubung dengan video dan audio dua arah di WiFi ke WiFi
- [ ] Hal yang sama di LTE ke LTE dan WiFi ke LTE
- [ ] Tipe kandidat tercatat untuk tiap kombinasi (bila relay, berarti TURN terbukti bekerja)
- [ ] Bila ada kombinasi yang gagal, putuskan solusinya (misalnya TURN lewat TLS di port 443) sebelum lanjut

### Tahap 3: Server lengkap

Tujuan: melengkapi server setelah jalur jaringan terbukti, dan menyesuaikan app agar memakainya.

Prompt untuk server:

```text
Tambahkan fitur berikut ke server tanpa mengubah pesan yang sudah ada di docs/PROTOCOL.md kecuali yang disebutkan, dan perbarui PROTOCOL.md bila ada perubahan.

- Kredensial TURN sementara: saat join, buat kredensial berumur minimal 12 jam dari penyedia TURN yang dipilih (secret disimpan lewat wrangler secret) dan kirim di iceServers pada joined. Jangan simpan atau log kredensial.
- deviceId yang sama bergabung lagi: sesi lama menerima error replaced lalu ditutup.
- Validasi pesan: JSON rusak, field hilang, atau ukuran lebih dari 64 KB dibalas error bad-message tanpa menutup koneksi peer lain.
- Rate limit percobaan join gagal per IP: setelah beberapa kali salah token, tunda atau tolak sementara.
- Jangan pernah mencatat isi signal (SDP dan ICE) atau token ke log.
- Bila salah satu peserta keluar lalu masuk lagi, peer yang tersisa menerima peer-left lalu peer-joined, dan role tetap konsisten: yang sudah ada di room impolite, pendatang baru polite.
Tambahkan skrip uji manual (wscat atau Node kecil) untuk: token salah, klien ketiga, replace sesi, dan reconnect.
```

Prompt untuk app Android:

```text
Ubah app spike: pakai iceServers dari pesan joined (hapus kredensial statis), dan sambungkan ulang WebSocket dengan backoff 1 sampai 30 detik tanpa menutup PeerConnection yang masih connected. Setelah reconnect, kirim join lagi dengan deviceId yang sama dan lanjutkan negosiasi hanya bila PeerConnection tidak lagi connected.
```

Gerbang:

- [ ] Ponsel menerima `iceServers` dari server dan tetap tersambung di WiFi dan LTE
- [ ] Sinyal WebSocket diputus saat panggilan berjalan lalu tersambung lagi: media tidak terputus
- [ ] Token salah, klien ketiga, dan replace sesi menghasilkan error yang tepat
- [ ] Tidak ada token atau SDP di log server

### Tahap 4: Klien Android inti

Tujuan: panggilan yang hidup walau layar mati, dengan tombol Mute dan Kamera On/Off.

Prompt:

```text
Kembangkan app Android spike menjadi klien inti. Ikuti docs/PROTOCOL.md dan blueprint.

- Pindahkan WebRTC, WebSocket, dan capturer ke CallService, sebuah Foreground Service bertipe camera|microphone (izin FOREGROUND_SERVICE_CAMERA, FOREGROUND_SERVICE_MICROPHONE, dan POST_NOTIFICATIONS). Service dimulai dari Activity yang sedang tampil.
- CallController memegang state (StateFlow): koneksi, partner, muted, cameraOn, mode. UI Compose hanya membaca state ini.
- Auto-join: saat Activity dibuka, service mulai dan join. Kamera default OFF (pengaturan: nyalakan otomatis saat partner hadir).
- Tombol Mute/Unmute: localAudioTrack.setEnabled. Tombol Kamera On/Off: Off menghentikan capturer total (stopCapture), On memulainya lagi. Keduanya tanpa renegosiasi.
- Kirim status (muted, camera, mode) lewat data channel ctrl dan tampilkan status partner di UI (ikon mic dicoret, placeholder berinisial bila kamera mati).
- Reconnect WebSocket dengan backoff dan ICE restart bila iceConnectionState disconnected lebih dari 5 detik atau failed. Status mute dan kamera dipulihkan setelah reconnect.
- Notifikasi Foreground Service dengan aksi Mute/Unmute, Kamera On/Off, dan Akhiri.
- Token dan deviceId disimpan di DataStore (token terenkripsi).
- Audio: MODE_IN_COMMUNICATION dan audio focus; telepon masuk otomatis mute lalu pulih.
Belum ada layar hitam dan Sleep Mode.
```

Gerbang:

- [ ] Layar dimatikan, audio tetap hidup selama 1 jam
- [ ] Ponsel didiamkan beberapa jam dengan layar mati, panggilan tidak putus (Doze)
- [ ] Mute dan Kamera terlihat di sisi partner
- [ ] Pindah WiFi ke LTE: koneksi pulih sendiri tanpa aksi pengguna

### Tahap 5: Layar hitam dan wake lock

Tujuan: memastikan kamera tetap mengirim saat layar hitam. Ini risiko teknis terbesar.

Prompt:

```text
Tambahkan layar hitam ke app Android. Ikuti blueprint.

- State screenOff di CallController. Saat true, Compose menampilkan satu Box hitam #000000 penuh layar tanpa elemen lain, dengan mode immersive (sembunyikan status bar dan navigation bar).
- Brightness jendela diset 0.01f saat screenOff dan dikembalikan ke BRIGHTNESS_OVERRIDE_NONE saat selesai.
- Ketuk dua kali di layar hitam memunculkan panel kontrol redup (Mute, Kamera, mode) selama 5 detik. Layar kembali hitam setelah 30 detik tanpa sentuhan.
- Saat layar hitam: lepas SurfaceViewRenderer remote dan panggil remoteVideoTrack.setEnabled(false). Saat berakhir: pasang kembali dan aktifkan.
- Selama panggilan: PARTIAL_WAKE_LOCK (dengan timeout pengaman yang diperbarui berkala) dan WifiLock WIFI_MODE_FULL_LOW_LATENCY. FLAG_KEEP_SCREEN_ON aktif selama kamera menyala.
- Onboarding sekali jalan: minta pengecualian battery optimization dan arahkan ke pengaturan autostart pabrikan.
- Sementara, layar hitam dipicu tombol uji di UI karena Sleep Mode belum ada.
```

Gerbang:

- [ ] Ponsel A (kamera On, layar hitam) tetap mengirim video selama beberapa jam, terlihat di ponsel B
- [ ] Panel kontrol dan aksi notifikasi bekerja saat layar hitam
- [ ] Hasil dicatat di ponsel yang dipakai. Bila kamera berhenti saat layar hitam, putuskan fallback audio-only sebelum lanjut

### Tahap 6: Sleep Mode

Tujuan: menekan panas, baterai, dan data dengan tiga mode.

Prompt:

```text
Tambahkan tiga mode (Normal, Sleep, Deep Sleep) sesuai blueprint.

- Normal: capture 640x480 24 fps, maxBitrate 600 kbps.
- Sleep: capture 320x240 15 fps lewat changeCaptureFormat, maxBitrate 150-200 kbps lewat RtpParameters.Encoding, layar hitam otomatis setelah hitung mundur 10 detik, dan kirim pesan req audio-only ke partner.
- Deep Sleep: kamera off total, audio saja, layar hitam.
- H.264 hardware didahulukan. Opus: tambahkan usedtx=1;useinbandfec=1;stereo=0;maxaveragebitrate=24000;ptime=40 lewat modifikasi SDP sebelum setLocalDescription.
- Sleep timer: setelah 30 menit Sleep naik ke Deep Sleep otomatis.
- Pindah mode tidak memutus panggilan dan tidak merenegosiasi.
- Panel stats (getStats): bitrate, encoderImplementation, tipe kandidat.
```

Gerbang:

- [ ] `encoderImplementation` menunjukkan encoder hardware, bukan software
- [ ] Bitrate sesuai target di tiap mode
- [ ] Satu malam di mode Sleep: baterai dan suhu dicatat tiap jam di kedua ponsel

### Tahap 7: Hardening

Tujuan: perlindungan perangkat dan ketahanan untuk pemakaian semalaman.

Prompt:

```text
Tambahkan perlindungan perangkat dan kehandalan.

- Thermal guard: baca BatteryManager.EXTRA_TEMPERATURE dan PowerManager.addThermalStatusListener. Suhu 40°C atau thermal MODERATE: turun satu mode dan kamera off, kirim notice ke partner. Suhu 42°C atau SEVERE: langsung Deep Sleep. Baterai di bawah 15% dan tidak mengisi: Deep Sleep. Di bawah 5%: beri tahu partner lalu akhiri panggilan. Mode tidak naik lagi otomatis.
- Deteksi service dimatikan sistem dan tampilkan ulang checklist onboarding.
- Perkiraan pemakaian data tampil di UI.
- Opsional, notifikasi partner masuk lewat FCM prioritas tinggi: tambahkan di server pengiriman push saat peserta pertama bergabung dan partner offline.
- Opsional, motion-gated video di Sleep: selisih frame 64x48 sekali per detik, pengiriman dijeda setelah 60 detik tanpa gerakan.
```

Gerbang:

- [ ] Uji semalam penuh (6-8 jam) di dua ponsel tanpa panggilan putus permanen
- [ ] Thermal guard menurunkan mode pada ambang uji dan partner menerima notifikasi
- [ ] Suhu, baterai, dan jumlah ICE restart tercatat

### Tahap 8: Klien Mac native

Dimulai hanya setelah tahap 7 lulus. Klien Swift mengikuti `PROTOCOL.md` yang sudah beku. Prompt-nya disusun nanti agar sesuai hasil uji Android.
