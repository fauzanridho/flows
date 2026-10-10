# Sleep Call — Signaling Server

Server signaling WebRTC untuk Sleep Call P2P. Berjalan di Cloudflare Workers + Durable Objects.

## Prasyarat

- Node.js 18+
- Akun Cloudflare (paket gratis cukup)
- `wrangler` CLI (sudah termasuk di devDependencies)

## Setup Lokal

```bash
cd server
npm install

# Set token rahasia untuk development
echo "ROOM_TOKEN = \"ganti-dengan-token-acak-minimal-32-karakter\"" >> .dev.vars

# Jalankan development server
npm run dev
```

Server akan berjalan di `http://localhost:8787`. WebSocket endpoint: `ws://localhost:8787/ws`.

## Uji dengan wscat

```bash
# Install wscat
npm install -g wscat

# Terminal 1 — Klien A
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer ganti-dengan-token-anda"
# Kirim: {"type":"join","deviceId":"A","platform":"test","appVersion":"1.0.0"}

# Terminal 2 — Klien B
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer ganti-dengan-token-anda"
# Kirim: {"type":"join","deviceId":"B","platform":"test","appVersion":"1.0.0"}
```

## Deploy

```bash
# Set secret token di Cloudflare
npx wrangler secret put ROOM_TOKEN
# Masukkan token minimal 32 karakter acak

# Deploy
npm run deploy
```

Setelah deploy, endpoint akan tersedia di `wss://sleep-call-signaling.<your-subdomain>.workers.dev/ws`.

## Arsitektur

- **Worker**: menerima request HTTP, autentikasi token, meneruskan ke Durable Object
- **Durable Object `Room`**: mengelola WebSocket connections, maks 2 peserta per room
- **WebSocket Hibernation API**: hemat resource, Durable Object tidur saat idle
- **Auto ping/pong**: `setWebSocketAutoResponse` agar koneksi tetap hidup tanpa membangunkan DO

## File

```
server/
├── src/
│   └── index.ts       # Worker entry point + Room Durable Object
├── wrangler.toml      # Konfigurasi Cloudflare Worker
├── tsconfig.json      # TypeScript config
├── package.json       # Dependencies dan scripts
└── README.md          # File ini
```
