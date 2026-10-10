/**
 * Sleep Call P2P — Signaling Server
 *
 * Cloudflare Worker + Durable Object untuk signaling WebRTC.
 * Mengikuti docs/PROTOCOL.md secara ketat.
 *
 * - Satu room permanen "private-sleep-room", maks 2 peserta
 * - Autentikasi via header Authorization: Bearer <token>
 * - WebSocket Hibernation API agar hemat resource
 * - ping/pong via setWebSocketAutoResponse
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Env {
  ROOM: DurableObjectNamespace;
  ROOM_TOKEN: string;
}

/** Data yang disimpan di WebSocket attachment */
interface WSAttachment {
  deviceId: string;
  platform: string;
  appVersion: string;
  role: "polite" | "impolite";
}

type ErrorCode = "bad-token" | "room-full" | "replaced" | "bad-message";

// ─── Room Durable Object ────────────────────────────────────────────────────

export class Room implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Auto-respond to ping with pong — doesn't wake the Durable Object
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "pong" })
      )
    );
  }

  /**
   * Handle incoming HTTP request (WebSocket upgrade).
   */
  async fetch(request: Request): Promise<Response> {
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
        this.handleJoin(ws, msg as Record<string, unknown>);
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
        // Handled by setWebSocketAutoResponse, but if it reaches here, reply manually
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

  private handleJoin(ws: WebSocket, msg: Record<string, unknown>): void {
    // Validate required fields
    const deviceId = msg.deviceId;
    const platform = msg.platform;
    const appVersion = msg.appVersion;

    if (!deviceId || typeof deviceId !== "string") {
      this.sendError(ws, "bad-message");
      return;
    }
    if (!platform || typeof platform !== "string") {
      this.sendError(ws, "bad-message");
      return;
    }

    const sockets = this.state.getWebSockets();

    // Check if same deviceId already exists — replace it
    for (const existing of sockets) {
      if (existing === ws) continue;
      const attachment = existing.deserializeAttachment() as WSAttachment | null;
      if (attachment && attachment.deviceId === deviceId) {
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

    // Count current joined peers (those with attachments, excluding the one we just closed)
    const joinedPeers = this.getJoinedPeers(ws);

    // Check room capacity
    if (joinedPeers.length >= 2) {
      this.send(ws, { type: "error", code: "room-full" });
      ws.close(1000, "room-full");
      return;
    }

    // Determine role: first in room = impolite, second = polite
    const role: "polite" | "impolite" = joinedPeers.length === 0 ? "impolite" : "polite";

    // Set attachment
    const attachment: WSAttachment = {
      deviceId: deviceId as string,
      platform: (platform as string) || "unknown",
      appVersion: (appVersion as string) || "0.0.0",
      role,
    };
    ws.serializeAttachment(attachment);

    // Send joined to this client
    const peerDeviceIds = joinedPeers.map((p) => p.attachment.deviceId);
    this.send(ws, {
      type: "joined",
      role,
      peers: peerDeviceIds,
      iceServers: [], // Empty for now — Tahap 3 adds TURN credentials
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

    console.log(`[join] deviceId=${deviceId} role=${role} peers=${peerDeviceIds.length}`);
  }

  private handleSignal(ws: WebSocket, msg: Record<string, unknown>): void {
    // Validate
    const kind = msg.kind;
    if (!kind || typeof kind !== "string" || !["offer", "answer", "candidate"].includes(kind)) {
      this.sendError(ws, "bad-message");
      return;
    }
    if (msg.data === undefined || msg.data === null) {
      this.sendError(ws, "bad-message");
      return;
    }

    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (!attachment) {
      this.sendError(ws, "bad-message");
      return;
    }

    // Forward to peer (do NOT log contents for security)
    const peer = this.getPeer(ws);
    if (peer) {
      this.send(peer.ws, {
        type: "signal",
        kind: kind as string,
        data: msg.data,
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

    // Notify peer
    const peer = this.getPeer(ws);
    if (peer) {
      this.send(peer.ws, {
        type: "peer-left",
        deviceId: attachment.deviceId,
      });
    }

    console.log(`[disconnect] deviceId=${attachment.deviceId}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Get all joined peers (WebSockets with attachments) excluding the given socket */
  private getJoinedPeers(excludeWs: WebSocket): Array<{ ws: WebSocket; attachment: WSAttachment }> {
    const sockets = this.state.getWebSockets();
    const peers: Array<{ ws: WebSocket; attachment: WSAttachment }> = [];

    for (const s of sockets) {
      if (s === excludeWs) continue;
      const attachment = s.deserializeAttachment() as WSAttachment | null;
      if (attachment) {
        peers.push({ ws: s, attachment });
      }
    }

    return peers;
  }

  /** Get the single peer of a given WebSocket, also excluding another socket */
  private getPeerExcluding(ws: WebSocket, alsoExclude: WebSocket): { ws: WebSocket; attachment: WSAttachment } | null {
    const sockets = this.state.getWebSockets();
    for (const s of sockets) {
      if (s === ws || s === alsoExclude) continue;
      const attachment = s.deserializeAttachment() as WSAttachment | null;
      if (attachment) return { ws: s, attachment };
    }
    return null;
  }

  /** Get the single peer of a given WebSocket */
  private getPeer(ws: WebSocket): { ws: WebSocket; attachment: WSAttachment } | null {
    const peers = this.getJoinedPeers(ws);
    return peers.length > 0 ? peers[0] : null;
  }

  /** Send a message to a WebSocket */
  private send(ws: WebSocket, msg: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(msg));
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

    // Only handle /ws
    if (url.pathname !== "/ws") {
      return new Response("Not found", { status: 404 });
    }

    // Check WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Authenticate
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!env.ROOM_TOKEN || token !== env.ROOM_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Route to Durable Object — single room with fixed name
    const roomId = env.ROOM.idFromName("private-sleep-room");
    const room = env.ROOM.get(roomId);

    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;
