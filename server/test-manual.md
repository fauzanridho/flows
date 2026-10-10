# Uji Manual Server Signaling

## Prasyarat

```bash
npm install -g wscat
cd server && npm run dev
```

Token development: `dev-test-token-ganti-di-production-min32char` (dari `.dev.vars`).

---

## 1. Token salah → 401

```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer wrong-token"
```

**Hasil yang diharapkan:** Koneksi ditolak, error 401.

---

## 2. Dua klien masuk

**Terminal 1 (Klien A):**
```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer dev-test-token-ganti-di-production-min32char"
```
Kirim:
```json
{"type":"join","deviceId":"A","platform":"test","appVersion":"1.0.0"}
```
**Terima:** `joined` dengan `role: "impolite"`, `peers: []`

**Terminal 2 (Klien B):**
```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer dev-test-token-ganti-di-production-min32char"
```
Kirim:
```json
{"type":"join","deviceId":"B","platform":"test","appVersion":"1.0.0"}
```
**Terima:**
- Klien B: `joined` dengan `role: "polite"`, `peers: ["A"]`
- Klien A: `peer-joined` dengan `deviceId: "B"`
- Klien B: `peer-joined` dengan `deviceId: "A"`

---

## 3. Signal diteruskan

Di Terminal 1 (Klien A), kirim:
```json
{"type":"signal","kind":"offer","data":{"type":"offer","sdp":"test-sdp"}}
```
**Klien B harus menerima:** `{"type":"signal","kind":"offer","data":{"type":"offer","sdp":"test-sdp"}}`

---

## 4. Klien ketiga → room-full

**Terminal 3 (Klien C):**
```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer dev-test-token-ganti-di-production-min32char"
```
Kirim:
```json
{"type":"join","deviceId":"C","platform":"test","appVersion":"1.0.0"}
```
**Terima:** `error` dengan `code: "room-full"`, lalu koneksi ditutup.

---

## 5. Replace sesi (deviceId sama)

Saat Klien A masih terhubung di Terminal 1, buka **Terminal 4:**
```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer dev-test-token-ganti-di-production-min32char"
```
Kirim:
```json
{"type":"join","deviceId":"A","platform":"test","appVersion":"1.0.0"}
```
**Hasil:**
- Terminal 1 (lama): menerima `error` `replaced` lalu tertutup
- Terminal 4 (baru): menerima `joined` dengan `role` sesuai
- Klien B: menerima `peer-left` lalu `peer-joined` untuk deviceId A

---

## 6. Leave dan reconnect

Di Terminal 2 (Klien B), kirim:
```json
{"type":"leave"}
```
**Klien A menerima:** `peer-left` dengan `deviceId: "B"`

Buka Terminal 5, sambung lagi sebagai B:
```bash
wscat -c "ws://localhost:8787/ws" -H "Authorization: Bearer dev-test-token-ganti-di-production-min32char"
```
Kirim:
```json
{"type":"join","deviceId":"B","platform":"test","appVersion":"1.0.0"}
```
**Klien A menerima:** `peer-joined` dengan `deviceId: "B"`
**Klien B baru menerima:** `joined` dengan `role: "polite"`, `peers: ["A"]`

---

## 7. Ping/pong

Kirim dari klien manapun:
```json
{"type":"ping"}
```
**Terima:** `{"type":"pong"}` (otomatis dari setWebSocketAutoResponse)

---

## 8. Bad message

Kirim JSON rusak:
```
not json at all
```
**Terima:** `{"type":"error","code":"bad-message"}`

Kirim tanpa type:
```json
{"foo":"bar"}
```
**Terima:** `{"type":"error","code":"bad-message"}`
