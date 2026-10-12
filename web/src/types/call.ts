/**
 * Types & Protocol Definitions for Sleep Call P2P
 * Strictly adheres to docs/PROTOCOL.md and Blueprint Sleep Call P2P.md
 */

export type CallMode = "normal" | "sleep" | "deep-sleep";

export type ConnectionStatus =
  | "disconnected"
  | "connecting-signaling"
  | "waiting-partner"
  | "negotiating"
  | "connected"
  | "failed"
  | "error";

export type PeerRole = "polite" | "impolite";

export interface IceServerConfig {
  urls: string[] | string;
  username?: string;
  credential?: string;
}

/** Messages from Server to Client */
export type ServerMessage =
  | {
      type: "joined";
      role: PeerRole;
      peers: string[];
      iceServers: IceServerConfig[];
    }
  | {
      type: "peer-joined";
      deviceId: string;
      platform: string;
    }
  | {
      type: "peer-left";
      deviceId: string;
    }
  | {
      type: "signal";
      kind: "offer" | "answer" | "candidate";
      data: any;
    }
  | {
      type: "state";
      muted: boolean;
      camera: boolean;
      screen: boolean;
      mode: CallMode;
    }
  | {
      type: "error";
      code: "bad-token" | "room-full" | "replaced" | "bad-message";
    }
  | {
      type: "pong";
    };

/** Messages from Client to Server */
export type ClientMessage =
  | {
      type: "join";
      deviceId: string;
      platform: string;
      appVersion: string;
    }
  | {
      type: "signal";
      kind: "offer" | "answer" | "candidate";
      data: any;
    }
  | {
      type: "state";
      muted: boolean;
      camera: boolean;
      screen: boolean;
      mode: CallMode;
    }
  | {
      type: "leave";
    }
  | {
      type: "ping";
    };

/** P2P RTCDataChannel 'ctrl' Messages */
export type DataChannelMessage =
  | {
      t: "state";
      muted: boolean;
      camera: boolean;
      screen: boolean;
      mode: CallMode;
      battery?: number;
      temp?: number;
      ts: number;
    }
  | {
      t: "req";
      want: "audio-only" | "video";
    }
  | {
      t: "notice";
      code: "thermal-down" | "battery-low" | "timer-deep" | "partner-muted";
    }
  | {
      t: "ping";
      ts: number;
    };

export interface PartnerState {
  online: boolean;
  deviceId?: string;
  platform?: string;
  muted: boolean;
  camera: boolean;
  screen: boolean;
  mode: CallMode;
  battery?: number;
  temp?: number;
  lastSeenTs?: number;
}

export interface CallStats {
  bitrateInKbps?: number;
  bitrateOutKbps?: number;
  rttMs?: number;
  packetLossPercent?: number;
  jitterMs?: number;
  candidateType?: string; // host | srflx | relay
  videoCodec?: string;
  audioCodec?: string;
}

export interface CallConfig {
  serverUrl: string;
  token: string;
  deviceId: string;
  autoJoin: boolean;
  preferHardwareH264: boolean;
}
