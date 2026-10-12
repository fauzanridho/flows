"use client";

import React from "react";
import {
  Moon,
  Wifi,
  WifiOff,
  MicOff,
  VideoOff,
  BatteryCharging,
  Battery,
  ShieldCheck,
  Settings,
  Activity,
  Sun,
  Bed,
} from "lucide-react";
import { ConnectionStatus, PartnerState, CallMode } from "@/types/call";

interface HeaderProps {
  status: ConnectionStatus;
  role: "polite" | "impolite" | null;
  partner: PartnerState;
  wakeLockActive: boolean;
  onOpenSettings: () => void;
  onToggleStats: () => void;
  statsOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  role,
  partner,
  wakeLockActive,
  onOpenSettings,
  onToggleStats,
  statsOpen,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case "connected":
        return (
          <span className="badge badge-connected animate-fade-in">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent-emerald)",
                boxShadow: "0 0 8px var(--accent-emerald)",
              }}
            />
            P2P Tersambung
          </span>
        );
      case "waiting-partner":
        return (
          <span className="badge badge-connecting animate-fade-in">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent-amber)",
              }}
            />
            Menunggu Partner...
          </span>
        );
      case "negotiating":
      case "connecting-signaling":
        return (
          <span className="badge badge-connecting animate-fade-in">
            <Activity size={12} className="animate-spin" />
            Menghubungkan...
          </span>
        );
      case "failed":
      case "error":
        return (
          <span className="badge badge-offline animate-fade-in">
            <WifiOff size={12} />
            Koneksi Terganggu
          </span>
        );
      default:
        return (
          <span className="badge">
            <WifiOff size={12} />
            Standby
          </span>
        );
    }
  };

  const getModeIcon = (mode: CallMode) => {
    switch (mode) {
      case "normal":
        return <Sun size={12} color="var(--accent-amber)" />;
      case "sleep":
        return <Moon size={12} color="var(--accent-indigo)" />;
      case "deep-sleep":
        return <Bed size={12} color="var(--accent-cyan)" />;
    }
  };

  return (
    <header
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        zIndex: 20,
        background: "linear-gradient(180deg, rgba(6, 7, 10, 0.85) 0%, rgba(6, 7, 10, 0) 100%)",
        pointerEvents: "auto",
      }}
    >
      {/* Brand & Connection Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 12px",
            background: "var(--bg-glass)",
            backdropFilter: "blur(16px)",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(99, 102, 241, 0.4)",
            }}
          >
            <Moon size={13} color="#fff" />
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "-0.01em",
              color: "#fff",
            }}
          >
            Sleep Call
          </span>
        </div>

        {getStatusBadge()}

        {wakeLockActive && (
          <span
            className="badge"
            style={{
              background: "rgba(99, 102, 241, 0.1)",
              borderColor: "rgba(99, 102, 241, 0.25)",
              color: "#a5b4fc",
            }}
            title="Screen Wake Lock aktif: Mac tidak akan tidur otomatis"
          >
            <ShieldCheck size={12} />
            Wake Lock On
          </span>
        )}
      </div>

      {/* Partner Status HUD */}
      {status === "connected" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "6px 16px",
            background: "var(--bg-glass)",
            backdropFilter: "blur(20px)",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: partner.online ? "var(--accent-emerald)" : "var(--text-muted)",
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              {partner.online ? "Partner Online" : "Partner Offline"}
            </span>
          </div>

          <div style={{ width: 1, height: 14, background: "var(--border-subtle)" }} />

          {/* Partner Indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {partner.muted ? (
              <span title="Partner di-mute" style={{ color: "var(--accent-rose)", display: "flex" }}>
                <MicOff size={14} />
              </span>
            ) : null}

            {!partner.camera ? (
              <span title="Kamera partner mati" style={{ color: "var(--text-muted)", display: "flex" }}>
                <VideoOff size={14} />
              </span>
            ) : null}

            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--text-secondary)",
                textTransform: "capitalize",
              }}
            >
              {getModeIcon(partner.mode)}
              {partner.mode}
            </span>

            {partner.battery !== undefined && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: partner.battery < 20 ? "var(--accent-rose)" : "var(--text-secondary)",
                }}
              >
                <Battery size={13} />
                {partner.battery}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onToggleStats}
          style={{
            padding: "8px 12px",
            background: statsOpen ? "rgba(99, 102, 241, 0.2)" : "var(--bg-glass)",
            border: `1px solid ${statsOpen ? "var(--accent-indigo)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-full)",
            color: statsOpen ? "#fff" : "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(16px)",
            transition: "all 0.15s ease",
          }}
          title="Buka panel diagnostik (Shortcut: D)"
        >
          <Activity size={14} />
          <span>Stats (D)</span>
        </button>

        <button
          onClick={onOpenSettings}
          style={{
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "50%",
            color: "var(--text-secondary)",
            cursor: "pointer",
            backdropFilter: "blur(16px)",
            transition: "all 0.15s ease",
          }}
          title="Pengaturan room & server"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
