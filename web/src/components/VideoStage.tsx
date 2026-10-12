"use client";

import React from "react";
import { User, VideoOff, MicOff, Volume2, Sparkles, Moon } from "lucide-react";
import { PartnerState, ConnectionStatus } from "@/types/call";

interface VideoStageProps {
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  partner: PartnerState;
  status: ConnectionStatus;
  cameraOn: boolean;
  muted: boolean;
}

export const VideoStage: React.FC<VideoStageProps> = ({
  remoteVideoRef,
  localVideoRef,
  partner,
  status,
  cameraOn,
  muted,
}) => {
  const showRemoteVideo = status === "connected" && partner.camera;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#06070a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Remote Video Stream */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: showRemoteVideo ? "block" : "none",
        }}
      />

      {/* Remote Placeholder when camera is OFF or Partner is waiting */}
      {!showRemoteVideo && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            zIndex: 5,
            textAlign: "center",
          }}
        >
          {/* Ambient Glow Avatar */}
          <div
            style={{
              position: "relative",
              width: 140,
              height: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Outer Breathing Aura */}
            <div
              className="animate-pulse-glow"
              style={{
                position: "absolute",
                inset: -20,
                borderRadius: "50%",
                background:
                  status === "connected"
                    ? "radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(99, 102, 241, 0) 70%)"
                    : "radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0) 70%)",
                filter: "blur(12px)",
              }}
            />

            {/* Inner Ring */}
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #161a26 0%, #0d1017 100%)",
                border: "1px solid var(--border-glow)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
              }}
            >
              {status === "connected" ? (
                <User size={48} color="#a5b4fc" />
              ) : (
                <Moon size={44} color="#fcd34d" />
              )}
            </div>
          </div>

          {/* Status Label & Micro-info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
              }}
            >
              {status === "connected"
                ? "Partner Tersambung"
                : status === "waiting-partner"
                ? "Menunggu Partner Bergabung"
                : "Sleep Call Room"}
            </h3>

            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {status === "connected"
                ? partner.camera
                  ? "Kamera aktif"
                  : "Kamera partner mati (Audio tetap tersambung)"
                : status === "waiting-partner"
                ? "Buka aplikasi di Android atau perangkat partner"
                : "Menghubungkan ke signaling server..."}
            </p>

            {status === "connected" && !partner.muted && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  padding: "4px 12px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "var(--radius-full)",
                  fontSize: 11,
                  color: "#34d399",
                }}
              >
                <Volume2 size={12} />
                Audio Partner Aktif
              </div>
            )}
          </div>
        </div>
      )}

      {/* Local Video Preview PIP (Bottom-Right) */}
      <div
        style={{
          position: "absolute",
          bottom: 104,
          right: 28,
          width: 190,
          height: 124,
          borderRadius: 14,
          overflow: "hidden",
          background: "rgba(14, 17, 24, 0.85)",
          backdropFilter: "blur(20px)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.7)",
          zIndex: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s ease",
        }}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
            display: cameraOn ? "block" : "none",
          }}
        />

        {!cameraOn && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              color: "var(--text-muted)",
              fontSize: 11,
            }}
          >
            <VideoOff size={20} />
            <span>Kamera Mati</span>
          </div>
        )}

        {/* Local Mic badge in PIP */}
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 8,
            padding: "2px 6px",
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(8px)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: muted ? "var(--accent-rose)" : "var(--text-secondary)",
          }}
        >
          {muted ? <MicOff size={11} /> : null}
          <span>{muted ? "Muted" : "Mic On"}</span>
        </div>
      </div>
    </div>
  );
};
