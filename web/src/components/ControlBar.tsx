"use client";

import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Sun,
  Moon,
  Bed,
  PhoneOff,
  PhoneCall,
  XCircle,
} from "lucide-react";
import { CallMode, ConnectionStatus } from "@/types/call";

interface ControlBarProps {
  status: ConnectionStatus;
  muted: boolean;
  cameraOn: boolean;
  mode: CallMode;
  countdown: number | null;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onChangeMode: (mode: CallMode) => void;
  onCancelCountdown: () => void;
  onConnect: () => void;
  onLeave: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  status,
  muted,
  cameraOn,
  mode,
  countdown,
  onToggleMute,
  onToggleCamera,
  onChangeMode,
  onCancelCountdown,
  onConnect,
  onLeave,
}) => {
  const isConnected = status === "connected" || status === "waiting-partner" || status === "negotiating";

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        zIndex: 20,
        pointerEvents: "auto",
      }}
    >
      {/* 10s Countdown Toast / Banner */}
      {countdown !== null && (
        <div
          className="animate-fade-in"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 18px",
            background: "rgba(10, 13, 20, 0.9)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--accent-indigo-glow)",
            borderRadius: "var(--radius-full)",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
            Layar hitam dalam <strong style={{ color: "var(--accent-indigo)" }}>{countdown}s</strong>
          </span>
          <button
            onClick={onCancelCountdown}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-full)",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <XCircle size={12} />
            Batalkan
          </button>
        </div>
      )}

      {/* Main Glass Control Bar */}
      <div
        className="glass-panel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 14px",
          borderRadius: 24,
          background: "rgba(12, 15, 22, 0.82)",
        }}
      >
        {isConnected ? (
          <>
            {/* Mute Button */}
            <button
              onClick={onToggleMute}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: muted ? "rgba(244, 63, 94, 0.2)" : "rgba(255, 255, 255, 0.07)",
                border: `1px solid ${muted ? "var(--accent-rose)" : "var(--border-subtle)"}`,
                color: muted ? "var(--accent-rose)" : "#fff",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: muted ? "0 0 15px var(--accent-rose-glow)" : "none",
              }}
              title={muted ? "Nyalakan Mikrofon (M)" : "Matikan Mikrofon (M)"}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
              <span style={{ fontSize: 8, marginTop: 1, opacity: 0.8 }}>M</span>
            </button>

            {/* Camera Button */}
            <button
              onClick={onToggleCamera}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: cameraOn ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.07)",
                border: `1px solid ${cameraOn ? "var(--accent-indigo)" : "var(--border-subtle)"}`,
                color: cameraOn ? "#a5b4fc" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: cameraOn ? "0 0 15px var(--accent-indigo-glow)" : "none",
              }}
              title={cameraOn ? "Matikan Kamera (C)" : "Nyalakan Kamera (C)"}
            >
              {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
              <span style={{ fontSize: 8, marginTop: 1, opacity: 0.8 }}>C</span>
            </button>

            <div style={{ width: 1, height: 26, background: "var(--border-subtle)", margin: "0 2px" }} />

            {/* Mode Segmented Controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(0, 0, 0, 0.4)",
                padding: 4,
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border-subtle)",
                gap: 4,
              }}
            >
              {/* Normal */}
              <button
                onClick={() => onChangeMode("normal")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  background: mode === "normal" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                  border: "none",
                  color: mode === "normal" ? "#fff" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Mode Normal: Video & Layar aktif (1)"
              >
                <Sun size={13} color={mode === "normal" ? "#fcd34d" : "currentColor"} />
                <span>Normal</span>
              </button>

              {/* Sleep */}
              <button
                onClick={() => onChangeMode("sleep")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  background: mode === "sleep" ? "rgba(99, 102, 241, 0.25)" : "transparent",
                  border: "none",
                  color: mode === "sleep" ? "#a5b4fc" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Mode Sleep: Resolusi hemat, layar hitam (2)"
              >
                <Moon size={13} color={mode === "sleep" ? "#a5b4fc" : "currentColor"} />
                <span>Sleep</span>
              </button>

              {/* Deep Sleep */}
              <button
                onClick={() => onChangeMode("deep-sleep")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  background: mode === "deep-sleep" ? "rgba(6, 182, 212, 0.25)" : "transparent",
                  border: "none",
                  color: mode === "deep-sleep" ? "#67e8f9" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Deep Sleep: Audio DTX hemat, kamera mati total (3)"
              >
                <Bed size={13} color={mode === "deep-sleep" ? "#67e8f9" : "currentColor"} />
                <span>Deep Sleep</span>
              </button>
            </div>

            <div style={{ width: 1, height: 26, background: "var(--border-subtle)", margin: "0 2px" }} />

            {/* Leave / End Call Button */}
            <button
              onClick={onLeave}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent-rose)",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                boxShadow: "0 0 15px var(--accent-rose-glow)",
                transition: "all 0.15s ease",
              }}
              title="Akhiri Panggilan"
            >
              <PhoneOff size={18} />
            </button>
          </>
        ) : (
          /* Join / Connect Button */
          <button
            onClick={onConnect}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 24px",
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
              border: "none",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)",
            }}
          >
            <PhoneCall size={16} />
            <span>Masuk Room Panggilan</span>
          </button>
        )}
      </div>
    </div>
  );
};
