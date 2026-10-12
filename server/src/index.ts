/**
 * Sleep Call P2P — Signaling Server (Tahap 3)
 *
 * Cloudflare Worker + Durable Object untuk signaling WebRTC.
 * Mengikuti docs/PROTOCOL.md secara ketat.
 *
 * Fitur Tahap 3:
 * - Kredensial TURN sementara (HMAC-SHA1, minimal 12 jam)
 * - Rate limiting auth (5 kegagalan per IP per menit -> blokir 30 detik)
 * - Keamanan log ketat (tidak ada SDP, ICE, atau token di log)
 * - Validasi pesan ketat (bad-message) tanpa memutuskan peer lain
 * - Pertahankan role polite / impolite dan device replace
 * - Auto ping/pong via setWebSocketAutoResponse
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Env {
  ROOM: DurableObjectNamespace;
  ROOM_TOKEN: string;
  TURN_SECRET?: string;
  TURN_URL?: string;
}

/** Data yang disimpan di WebSocket attachment */
interface WSAttachment {
  deviceId: string;
  platform: string;
  appVersion: string;
  role: "polite" | "impolite";
}

type ErrorCode = "bad-token" | "room-full" | "replaced" | "bad-message";

interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

// ─── Rate Limiting (In-Memory per Worker Instance) ──────────────────────────

interface RateLimitEntry {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) return false;
  if (entry.blockedUntil > now) {
    return true;
  }
  // Reset if block expired
  if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
    rateLimitMap.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAuth(ip: string): void {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.firstFailureAt > 60000) {
    entry = { failures: 1, firstFailureAt: now, blockedUntil: 0 };
  } else {
    entry.failures += 1;
    if (entry.failures >= 5) {
      entry.blockedUntil = now + 30000; // Blokir 30 detik
      console.warn(`[rate-limit] IP ${ip} blocked for 30s after 5 failed auth attempts`);
    }
  }
  rateLimitMap.set(ip, entry);
}

function recordSuccessfulAuth(ip: string): void {
  rateLimitMap.delete(ip);
}

// ─── TURN Credentials Generator (HMAC-SHA1) ─────────────────────────────────

async function generateHmacSha1Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function buildIceServers(env: Env, deviceId: string): Promise<IceServerConfig[]> {
  const iceServers: IceServerConfig[] = [];

  // Jika TURN_SECRET dan TURN_URL dikonfigurasi, buat ephemeral credentials
  if (env.TURN_SECRET && env.TURN_URL) {
    const ttlSeconds = 24 * 3600; // 24 jam (memenuhi syarat minimal 12 jam)
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${deviceId}`;
    const credential = await generateHmacSha1Base64(env.TURN_SECRET, username);
    const urls = env.TURN_URL.split(",").map((u) => u.trim()).filter(Boolean);

    iceServers.push({
      urls,
      username,
      credential,
    });
  }

  // Selalu sertakan STUN Google sebagai fallback / kandidat langsung
  iceServers.push({
    urls: ["stun:stun.l.google.com:19302"],
  });

  return iceServers;
}

// ─── Room Durable Object ────────────────────────────────────────────────────

export class Room implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Auto-respond to ping with pong — hemat baterai & resource DO
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "pong" })
      )
    );
  }

  /**
   * Handle incoming HTTP request (WebSocket upgrade or room reset).
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/reset") {
      const sockets = this.state.getWebSockets();
      const devices = sockets.map((s) => s.deserializeAttachment());
      let closed = 0;
      for (const s of sockets) {
        try {
          s.serializeAttachment(null);
          s.close(1000, "room-reset");
          closed++;
        } catch {}
      }
      return new Response(JSON.stringify({ ok: true, closedSockets: closed, devices }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation — attachment will be set on join
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── WebSocket Hibernation Handlers ─────────────────────────────────────

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    // Only handle text messages
    if (typeof rawMessage !== "string") {
      this.sendError(ws, "bad-message");
      return;
    }

    // Size check: max 64 KB
    if (rawMessage.length > 65536) {
      this.sendError(ws, "bad-message");
      return;
    }

    // Parse JSON
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawMessage);
    } catch {
      this.sendError(ws, "bad-message");
      return;
    }

    // Validate type field
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
      this.sendError(ws, "bad-message");
      return;
    }

    switch (msg.type) {
      case "join":
        await this.handleJoin(ws, msg as Record<string, unknown>);
        break;
      case "signal":
        this.handleSignal(ws, msg as Record<string, unknown>);
        break;
      case "state":
        this.handleState(ws, msg as Record<string, unknown>);
        break;
      case "leave":
        this.handleLeave(ws);
        break;
      case "ping":
        this.send(ws, { type: "pong" });
        break;
      default:
        this.sendError(ws, "bad-message");
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  // ─── Message Handlers ──────────────────────────────────────────────────

  private async handleJoin(ws: WebSocket, msg: Record<string, unknown>): Promise<void> {
    // Validate required fields
    const deviceId = msg.deviceId;
    const platform = msg.platform;
    const appVersion = msg.appVersion;

    if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length === 0) {
      this.sendError(ws, "bad-message");
      return;
    }
    if (!platform || typeof platform !== "string") {
      this.sendError(ws, "bad-message");
      return;
    }

    const sockets = this.state.getWebSockets();

    // Check if same deviceId OR same platform already exists — replace it
    for (const existing of sockets) {
      if (existing === ws) continue;
      const attachment = existing.deserializeAttachment() as WSAttachment | null;
      if (
        attachment &&
        (attachment.deviceId === deviceId ||
          (attachment.platform === platform && platform !== "unknown" && platform !== "test"))
      ) {
        // Notify peer about the old connection leaving
        const otherPeer = this.getPeerExcluding(existing, ws);
        if (otherPeer) {
          this.send(otherPeer.ws, { type: "peer-left", deviceId: attachment.deviceId });
        }
        // Clear attachment so getJoinedPeers won't count this socket
        existing.serializeAttachment(null);
        // Send "replaced" to old session and close it
        this.send(existing, { type: "error", code: "replaced" });
        existing.close(1000, "replaced");
      }
    }

    // Count current joined peers (those with attachments, excluding replaced ones)
    const joinedPeers = this.getJoinedPeers(ws);

    // Check room capacity (max 2)
    if (joinedPeers.length >= 2) {
      this.send(ws, { type: "error", code: "room-full" });
      ws.close(1000, "room-full");
      return;
    }

    // Determine role: guarantee exactly one "impolite" and one "polite" in the room
    let role: "polite" | "impolite";
    if (joinedPeers.length === 0) {
      role = "impolite";
    } else {
      const otherRole = joinedPeers[0].attachment.role;
      role = otherRole === "impolite" ? "polite" : "impolite";
    }

    // Set attachment
    const attachment: WSAttachment = {
      deviceId: deviceId as string,
      platform: (platform as string) || "unknown",
      appVersion: (appVersion as string) || "0.0.0",
      role,
    };
    ws.serializeAttachment(attachment);

    // Dapatkan kredensial ICE (TURN + STUN)
    const iceServers = await buildIceServers(this.env, deviceId as string);

    // Send joined to this client (send PeerInfo objects { deviceId, platform } for Android & Web compatibility)
    const peerList = joinedPeers.map((p) => ({
      deviceId: p.attachment.deviceId,
      platform: p.attachment.platform || "unknown",
    }));
    this.send(ws, {
      type: "joined",
      role,
      peers: peerList,
      iceServers,
    });

    // Notify all existing peers about new peer, and notify new peer about existing peers
    for (const peer of joinedPeers) {
      // Tell existing peer about new peer
      this.send(peer.ws, {
        type: "peer-joined",
        deviceId: deviceId as string,
        platform: (platform as string) || "unknown",
      });

      // Tell new peer about existing peer
      this.send(ws, {
        type: "peer-joined",
        deviceId: peer.attachment.deviceId,
        platform: peer.attachment.platform,
      });
    }

    // Aman untuk log: hanya deviceId dan role, tidak ada token/kredensial
    console.log(`[join] deviceId=${deviceId} role=${role} peers=${peerList.length}`);
  }

  private handleSignal(ws: WebSocket, msg: Record<string, unknown>): void {
    const kind = msg.kind;
    if (!kind || typeof kind !== "string" || !["offer", "answer", "candidate"].includes(kind)) {
      this.sendError(ws, "bad-message");
      return;
    }
    if (msg.data === undefined || msg.data === null || typeof msg.data !== "object") {
      this.sendError(ws, "bad-message");
      return;
    }

    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (!attachment) {
      this.sendError(ws, "bad-message");
      return;
    }

    // Forward to peer (TIDAK PERNAH mencatat payload SDP/ICE ke log demi privasi)
    const peer = this.getPeer(ws);
    if (peer) {
      this.send(peer.ws, {
        type: "signal",
        kind: kind as string,
        data: msg.data,
        deviceId: (msg.deviceId as string) || attachment.deviceId,
      });
    }
  }

  private handleState(ws: WebSocket, msg: Record<string, unknown>): void {
    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (!attachment) {
      this.sendError(ws, "bad-message");
      return;
    }

    // Forward to peer
    const peer = this.getPeer(ws);
    if (peer) {
      this.send(peer.ws, {
        type: "state",
        muted: msg.muted,
        camera: msg.camera,
        screen: msg.screen,
        mode: msg.mode,
        deviceId: (msg.deviceId as string) || attachment.deviceId,
      });
    }
  }

  private handleLeave(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (attachment) {
      console.log(`[leave] deviceId=${attachment.deviceId}`);
    }
    this.handleDisconnect(ws);
    ws.close(1000, "leave");
  }

  private handleDisconnect(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (!attachment) return;

    // Notify peer before clearing attachment
    const peer = this.getPeer(ws);

    // Clear attachment so this socket is not counted in getJoinedPeers
    try {
      ws.serializeAttachment(null);
    } catch {}

    if (peer) {
      this.send(peer.ws, {
        type: "peer-left",
        deviceId: attachment.deviceId,
      });
    }

    console.log(`[disconnect] deviceId=${attachment.deviceId}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Get all joined peers (sockets with attachments), optionally excluding one */
  private getJoinedPeers(excludeWs?: WebSocket): Array<{ ws: WebSocket; attachment: WSAttachment }> {
    const sockets = this.state.getWebSockets();
    const result: Array<{ ws: WebSocket; attachment: WSAttachment }> = [];

    for (const socket of sockets) {
      if (excludeWs && socket === excludeWs) continue;
      // In Cloudflare Workers, check readyState if available (readyState 1 is OPEN)
      if ("readyState" in socket && socket.readyState !== 1 && socket.readyState !== undefined) {
        try { socket.serializeAttachment(null); } catch {}
        continue;
      }
      const attachment = socket.deserializeAttachment() as WSAttachment | null;
      if (attachment) {
        result.push({ ws: socket, attachment });
      }
    }

    return result;
  }

  /** Get the single peer of a given WebSocket, also excluding another socket */
  private getPeerExcluding(ws: WebSocket, alsoExclude: WebSocket): { ws: WebSocket; attachment: WSAttachment } | null {
    const sockets = this.state.getWebSockets();
    for (const socket of sockets) {
      if (socket === ws || socket === alsoExclude) continue;
      const attachment = socket.deserializeAttachment() as WSAttachment | null;
      if (attachment) {
        return { ws: socket, attachment };
      }
    }
    return null;
  }

  /** Get the single peer of a given WebSocket */
  private getPeer(ws: WebSocket): { ws: WebSocket; attachment: WSAttachment } | null {
    const peers = this.getJoinedPeers(ws);
    return peers.length > 0 ? peers[0] : null;
  }

  /** Send a JSON message to a WebSocket */
  private send(ws: WebSocket, data: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Socket might be closed already
    }
  }

  /** Send an error message */
  private sendError(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { type: "error", code });
  }
}

// ─── Worker Entry Point ─────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle /ws and /reset
    if (url.pathname !== "/ws" && url.pathname !== "/reset") {
      return new Response("Not found", { status: 404 });
    }

    const clientIp =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "127.0.0.1";

    // Rate limit check
    if (isRateLimited(clientIp)) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "30" },
      });
    }

    // Authenticate (Header Bearer or query param for browser WebSockets)
    let token: string | null = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    } else if (url.searchParams.has("token")) {
      token = url.searchParams.get("token");
    }

    if (!token || !env.ROOM_TOKEN || token !== env.ROOM_TOKEN) {
      recordFailedAuth(clientIp);
      return new Response("Unauthorized", { status: 401 });
    }

    // Berhasil autentikasi
    recordSuccessfulAuth(clientIp);

    // If reset endpoint, route directly to DO
    if (url.pathname === "/reset") {
      const roomId = env.ROOM.idFromName("private-sleep-room");
      const room = env.ROOM.get(roomId);
      return room.fetch(request);
    }

    // Check WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Route to Durable Object — single room with fixed name
    const roomId = env.ROOM.idFromName("private-sleep-room");
    const room = env.ROOM.get(roomId);

    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;
