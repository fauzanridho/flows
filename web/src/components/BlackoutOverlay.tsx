"use client";

import React, { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Sun, Moon, Bed, Volume2 } from "lucide-react";
import { CallMode, PartnerState } from "@/types/call";

interface BlackoutOverlayProps {
  isBlackout: boolean;
  isPeeking: boolean;
  onTriggerPeek: () => void;
  muted: boolean;
  cameraOn: boolean;
  mode: CallMode;
  partner: PartnerState;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onWakeScreen: () => void;
}

export const BlackoutOverlay: React.FC<BlackoutOverlayProps> = ({
  isBlackout,
  isPeeking,
  onTriggerPeek,
  muted,
  cameraOn,
  mode,
  partner,
  onToggleMute,
  onToggleCamera,
  onWakeScreen,
}) => {
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!isBlackout) return null;

  return (
    <div
      onMouseMove={onTriggerPeek}
      onClick={onTriggerPeek}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#000000",
        zIndex: 50,
        cursor: isPeeking ? "default" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "48px 32px",
        userSelect: "none",
        transition: "opacity 0.4s ease",
      }}
    >
      {/* Peek HUD - Only visible when isPeeking is true */}
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: isPeeking ? 0.75 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: isPeeking ? "auto" : "none",
        }}
      >
        {/* Soft Clock */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 32, fontWeight: 300, color: "#9ca3af", letterSpacing: 1 }}>
            {currentTime}
          </span>
          <span style={{ fontSize: 11, color: "#4b5563" }}>
            Mode {mode === "deep-sleep" ? "Deep Sleep" : "Sleep"} Aktif
          </span>
        </div>

        {/* Partner Audio Activity */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: "var(--radius-full)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "#9ca3af",
            fontSize: 12,
          }}
        >
          <Volume2 size={14} color="#10b981" />
          <span>{partner.online ? (partner.muted ? "Partner mute" : "Audio terhubung") : "Partner offline"}</span>
        </div>
      </div>

      {/* Dimmed Central Controls for Sleepy Hands */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          opacity: isPeeking ? 0.85 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: isPeeking ? "auto" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "12px 24px",
            background: "rgba(18, 22, 32, 0.65)",
            backdropFilter: "blur(24px)",
            borderRadius: 36,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Mute Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: muted ? "rgba(244, 63, 94, 0.3)" : "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${muted ? "var(--accent-rose)" : "rgba(255, 255, 255, 0.15)"}`,
              color: muted ? "var(--accent-rose)" : "#fff",
              cursor: "pointer",
            }}
            title="Mute / Unmute (M)"
          >
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          {/* Camera Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCamera();
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: cameraOn ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${cameraOn ? "var(--accent-indigo)" : "rgba(255, 255, 255, 0.15)"}`,
              color: cameraOn ? "#a5b4fc" : "#6b7280",
              cursor: "pointer",
            }}
            title="Kamera On / Off (C)"
          >
            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          {/* Wake Screen Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWakeScreen();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 22px",
              height: 56,
              borderRadius: 28,
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
            title="Bangunkan Layar (1)"
          >
            <Sun size={18} color="#fcd34d" />
            <span>Hidupkan Layar</span>
          </button>
        </div>

        <p style={{ fontSize: 11, color: "#4b5563" }}>
          Gerakkan kursor atau tekan tombol apa pun untuk melihat kontrol
        </p>
      </div>

      {/* Bottom hint spacer */}
      <div style={{ height: 20 }} />
    </div>
  );
};
