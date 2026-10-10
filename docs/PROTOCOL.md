# PROTOCOL.md — Sleep Call P2P Signaling Protocol

**Versi**: 1.0
**Terakhir diperbarui**: 2026-10-11

---

## Ikhtisar

Signaling menggunakan **WebSocket JSON polos** (bukan Socket.io). Satu room permanen bernama `private-sleep-room`, maksimal **2 peserta**. Server hanya meneruskan pesan negosiasi WebRTC dan tidak pernah menyentuh media.

---

## Autentikasi

- Klien menghubungkan WebSocket ke `wss://<host>/ws`
- Header saat upgrade: `Authorization: Bearer <token>`
- Token salah → server menolak upgrade dengan **HTTP 401**
- Token disimpan sebagai secret di server (environment variable / `wrangler secret`)

---

## Peran (Role)

| Urutan masuk | Role | Tugas |
|---|---|---|
| Peserta pertama (sudah ada di room) | `impolite` | Membuat offer, menang saat glare |
| Peserta kedua (pendatang baru) | `polite` | Menerima offer, rollback saat glare |

Saat salah satu peserta keluar lalu masuk lagi, yang **sudah ada** di room selalu menjadi `impolite`, pendatang baru selalu `polite`.

---

## Pesan Klien → Server

Semua pesan adalah JSON dengan field `type`.

### 1. `join`

Dikirim setelah WebSocket terbuka.

```json
{
  "type": "join",
  "deviceId": "android-abc123",
  "platform": "android",
  "appVersion": "1.0.0"
}
```

**Aturan:**
- `deviceId` wajib, string unik per perangkat.
- Bila `deviceId` yang sama sudah ada di room, sesi lama menerima `error` `replaced` lalu ditutup. Sesi baru mengambil alih.
- Peserta ketiga (room sudah 2 orang dengan `deviceId` berbeda) menerima `error` `room-full` lalu ditutup.

### 2. `signal`

Meneruskan SDP offer/answer dan ICE candidate ke peer lain.

```json
{
  "type": "signal",
  "kind": "offer",
  "data": {
    "type": "offer",
    "sdp": "v=0\r\n..."
  }
}
```

```json
{
  "type": "signal",
  "kind": "answer",
  "data": {
    "type": "answer",
    "sdp": "v=0\r\n..."
  }
}
```

```json
{
  "type": "signal",
  "kind": "candidate",
  "data": {
    "candidate": "candidate:...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

**Aturan:**
- Server meneruskan ke peer lain **apa adanya** tanpa mengubah isi `data`.
- Server **tidak pernah** mencatat (log) isi `data`.

### 3. `state`

Cadangan status bila data channel `ctrl` belum terbuka.

```json
{
  "type": "state",
  "muted": false,
  "camera": false,
  "screen": false,
  "mode": "normal"
}
```

**Aturan:**
- Server meneruskan ke peer lain tanpa mengubah.
- Mode valid: `"normal"`, `"sleep"`, `"deep-sleep"`.

### 4. `leave`

Keluar dari room dengan rapi.

```json
{
  "type": "leave"
}
```

### 5. `ping`

Heartbeat.

```json
{
  "type": "ping"
}
```

---

## Pesan Server → Klien

### 1. `joined`

Balasan setelah `join` berhasil.

```json
{
  "type": "joined",
  "role": "impolite",
  "peers": [],
  "iceServers": [
    {
      "urls": ["turn:turn.example.com:443?transport=tcp"],
      "username": "1760000000:user",
      "credential": "base64hmac..."
    },
    {
      "urls": ["stun:stun.l.google.com:19302"]
    }
  ]
}
```

**Field:**
- `role`: `"impolite"` (peserta pertama) atau `"polite"` (peserta kedua).
- `peers`: array `deviceId` peserta yang sudah ada. Kosong bila sendiri.
- `iceServers`: array konfigurasi ICE. Kredensial TURN sementara (minimal 12 jam). Pada tahap awal bisa kosong `[]`.

### 2. `peer-joined`

Dikirim ke **kedua** peserta saat peserta kedua bergabung.

```json
{
  "type": "peer-joined",
  "deviceId": "android-xyz789",
  "platform": "android"
}
```

### 3. `peer-left`

Dikirim ke peserta yang tersisa saat peer keluar atau terputus.

```json
{
  "type": "peer-left",
  "deviceId": "android-xyz789"
}
```

### 4. `signal`

Relay dari peer lain, diteruskan apa adanya.

```json
{
  "type": "signal",
  "kind": "offer",
  "data": { ... }
}
```

### 5. `state`

Relay status dari peer lain.

```json
{
  "type": "state",
  "muted": false,
  "camera": false,
  "screen": false,
  "mode": "normal"
}
```

### 6. `error`

```json
{
  "type": "error",
  "code": "bad-token"
}
```

**Kode error:**
| Code | Penyebab | Tindakan server |
|---|---|---|
| `bad-token` | Token salah saat upgrade | Tolak dengan HTTP 401, koneksi tidak dibuat |
| `room-full` | Sudah 2 peserta dengan `deviceId` berbeda | Kirim error lalu tutup koneksi |
| `replaced` | `deviceId` yang sama bergabung dari koneksi baru | Kirim ke sesi **lama** lalu tutup sesi lama |
| `bad-message` | JSON rusak, field hilang, atau ukuran > 64 KB | Kirim error, **jangan** tutup koneksi |

### 7. `pong`

Balasan `ping`. Menggunakan `setWebSocketAutoResponse` agar tidak membangunkan Durable Object.

```json
{
  "type": "pong"
}
```

---

## Data Channel `ctrl` (Peer-to-Peer)

Channel bernama `ctrl`, **ordered**, **reliable**, dibuat oleh peer `impolite`.

Semua pesan JSON dengan field `t` (type singkat untuk hemat bandwidth).

### 1. `state`

```json
{
  "t": "state",
  "muted": true,
  "camera": false,
  "screen": false,
  "mode": "deep-sleep",
  "battery": 62,
  "temp": 36.4,
  "ts": 1760130000000
}
```

- Dikirim saat status berubah **dan** sebagai heartbeat setiap 30 detik.
- Pesan dengan `ts` lebih lama dari `state` terakhir **diabaikan**.

### 2. `req`

```json
{
  "t": "req",
  "want": "audio-only"
}
```

```json
{
  "t": "req",
  "want": "video"
}
```

- Dikirim otomatis saat layar hitam aktif (`audio-only`) dan saat berakhir (`video`).
- Pengirim **boleh menolak** bila sedang Deep Sleep.

### 3. `notice`

```json
{
  "t": "notice",
  "code": "thermal-down"
}
```

**Kode notice:**
| Code | Arti |
|---|---|
| `thermal-down` | Perangkat panas, mode diturunkan |
| `battery-low` | Baterai di bawah 15% |
| `timer-deep` | Sleep timer memaksa Deep Sleep |
| `partner-muted` | Partner mute |

### 4. `ping`

```json
{
  "t": "ping",
  "ts": 1760130000000
}
```

---

## Urutan Pesan: Skenario Umum

### Skenario 1: Dua peserta masuk

```
Klien A → Server: [WebSocket upgrade, Authorization: Bearer <token>]
Server → Klien A: [HTTP 101 Switching Protocols]
Klien A → Server: {"type":"join","deviceId":"A","platform":"android","appVersion":"1.0.0"}
Server → Klien A: {"type":"joined","role":"impolite","peers":[],"iceServers":[...]}

Klien B → Server: [WebSocket upgrade, Authorization: Bearer <token>]
Server → Klien B: [HTTP 101 Switching Protocols]
Klien B → Server: {"type":"join","deviceId":"B","platform":"android","appVersion":"1.0.0"}
Server → Klien B: {"type":"joined","role":"polite","peers":["A"],"iceServers":[...]}
Server → Klien A: {"type":"peer-joined","deviceId":"B","platform":"android"}
Server → Klien B: {"type":"peer-joined","deviceId":"A","platform":"android"}

— Klien A (impolite) membuat offer —
Klien A → Server: {"type":"signal","kind":"offer","data":{"type":"offer","sdp":"..."}}
Server → Klien B: {"type":"signal","kind":"offer","data":{"type":"offer","sdp":"..."}}
Klien B → Server: {"type":"signal","kind":"answer","data":{"type":"answer","sdp":"..."}}
Server → Klien A: {"type":"signal","kind":"answer","data":{"type":"answer","sdp":"..."}}

— ICE candidates saling dipertukarkan —
Klien A → Server: {"type":"signal","kind":"candidate","data":{...}}
Server → Klien B: {"type":"signal","kind":"candidate","data":{...}}
Klien B → Server: {"type":"signal","kind":"candidate","data":{...}}
Server → Klien A: {"type":"signal","kind":"candidate","data":{...}}

— Media tersambung, data channel ctrl dibuka oleh A (impolite) —
```

### Skenario 2: Salah satu keluar

```
Klien B → Server: {"type":"leave"}
Server → Klien A: {"type":"peer-left","deviceId":"B"}
— Klien A menampilkan "Partner offline", menghentikan video, heartbeat tetap jalan —
```

### Skenario 3: Reconnect (B masuk lagi)

```
Klien B → Server: [WebSocket upgrade, Authorization: Bearer <token>]
Klien B → Server: {"type":"join","deviceId":"B","platform":"android","appVersion":"1.0.0"}
Server → Klien B: {"type":"joined","role":"polite","peers":["A"],"iceServers":[...]}
Server → Klien A: {"type":"peer-joined","deviceId":"B","platform":"android"}
Server → Klien B: {"type":"peer-joined","deviceId":"A","platform":"android"}

— Klien A (impolite, sudah di room) membuat offer baru —
— Negosiasi ulang, media tersambung kembali —
```

### Skenario 4: DeviceId sama bergabung ulang (replace)

```
— Klien A sudah terhubung dari koneksi lama —
Klien A (koneksi baru) → Server: [WebSocket upgrade]
Klien A (koneksi baru) → Server: {"type":"join","deviceId":"A",...}
Server → Klien A (koneksi lama): {"type":"error","code":"replaced"}
— Server tutup koneksi lama —
Server → Klien A (koneksi baru): {"type":"joined","role":"impolite","peers":["B"],...}
```

### Skenario 5: Glare (offer bentrok)

```
— Kedua klien mengirim offer hampir bersamaan —
Klien A → Server: {"type":"signal","kind":"offer",...}
Klien B → Server: {"type":"signal","kind":"offer",...}
Server → Klien B: {"type":"signal","kind":"offer",...}  ← dari A
Server → Klien A: {"type":"signal","kind":"offer",...}  ← dari B

— Klien B (polite) melakukan rollback dan menerima offer A —
— Klien A (impolite) mengabaikan offer B dan menunggu answer —
```

---

## Keamanan

- Token minimal 32 karakter acak
- Hanya `wss://` (TLS wajib)
- Server **tidak pernah** mencatat token, SDP, atau ICE candidate ke log
- Kredensial TURN bersifat sementara (HMAC, masa berlaku minimal 12 jam)
- Batas 2 peserta per room
- Rate limit percobaan join gagal per IP

---

## Catatan Implementasi

- Server: Cloudflare Worker + Durable Object (WebSocket Hibernation API)
- ping/pong: menggunakan `setWebSocketAutoResponse` agar Durable Object tidak terbangun
- Validasi ukuran pesan: maksimal 64 KB
- Field `type` wajib di semua pesan klien → server
- Field `t` (singkatan type) dipakai di data channel `ctrl` untuk hemat bandwidth
