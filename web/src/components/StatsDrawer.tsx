"use client";

import React from "react";
import { X, Activity, Server, Radio, Shield, Cpu, RefreshCw } from "lucide-react";
import { CallStats, PeerRole, PartnerState } from "@/types/call";

interface StatsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stats: CallStats;
  role: PeerRole | null;
  deviceId: string;
  partner: PartnerState;
}

export const StatsDrawer: React.FC<StatsDrawerProps> = ({
  isOpen,
  onClose,
  stats,
  role,
  deviceId,
  partner,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 76,
        right: 24,
        width: 320,
        zIndex: 40,
        pointerEvents: "auto",
      }}
      className="animate-fade-in"
    >
      <div className="glass-panel-heavy" style={{ padding: 20 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            paddingBottom: 10,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={16} color="var(--accent-indigo)" />
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Statistik Koneksi (P2P)
            </h4>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Jalur Media (Candidate Type) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <Radio size={13} />
              Jalur Media
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  stats.candidateType === "host"
                    ? "var(--accent-emerald)"
                    : stats.candidateType === "relay"
                    ? "var(--accent-amber)"
                    : "#a5b4fc",
                textTransform: "uppercase",
              }}
            >
              {stats.candidateType ? `${stats.candidateType} (${stats.candidateType === "host" ? "Langsung P2P" : stats.candidateType === "relay" ? "TURN Relay" : "STUN Reflexive"})` : "Memeriksa..."}
            </span>
          </div>

          {/* RTT / Latensi */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Latensi (RTT)</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              {stats.rttMs !== undefined ? `${stats.rttMs} ms` : "—"}
            </span>
          </div>

          {/* Packet Loss */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Packet Loss</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: (stats.packetLossPercent || 0) > 2 ? "var(--accent-rose)" : "var(--accent-emerald)",
              }}
            >
              {stats.packetLossPercent !== undefined ? `${stats.packetLossPercent}%` : "0%"}
            </span>
          </div>

          {/* Jitter */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jitter</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              {stats.jitterMs !== undefined ? `${stats.jitterMs} ms` : "—"}
            </span>
          </div>

          {/* Role Perfect Negotiation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <Shield size={13} />
              Role Negosiasi
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              {role || "—"}
            </span>
          </div>

          {/* Encoders & Audio DTX */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <Cpu size={13} />
              Audio Codec
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#34d399" }}>
              Opus + DTX Hemat
            </span>
          </div>

          {/* Video Codec Preference */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Video Codec</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#a5b4fc" }}>
              H.264 Hardware
            </span>
          </div>

          {/* Device ID */}
          <div
            style={{
              marginTop: 6,
              paddingTop: 10,
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Device ID Lokal:</span>
            <code
              style={{
                fontSize: 10,
                color: "var(--text-secondary)",
                wordBreak: "break-all",
                background: "rgba(0, 0, 0, 0.4)",
                padding: "3px 6px",
                borderRadius: 4,
              }}
            >
              {deviceId}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
