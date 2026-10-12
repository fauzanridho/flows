"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  User,
  VideoOff,
  MicOff,
  Volume2,
  Sparkles,
  Moon,
  Smartphone,
  Monitor,
  Maximize2,
  Minimize2,
  RotateCw,
  PhoneCall,
} from "lucide-react";
import { PartnerState, ConnectionStatus } from "@/types/call";

interface VideoStageProps {
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  partner: PartnerState;
  status: ConnectionStatus;
  cameraOn: boolean;
  muted: boolean;
  onConnect?: () => void;
}

export const VideoStage: React.FC<VideoStageProps> = ({
  remoteVideoRef,
  localVideoRef,
  partner,
  status,
  cameraOn,
  muted,
  onConnect,
}) => {
  const showRemoteVideo = status === "connected" && partner.camera;

  // Auto-rotation & aspect ratio states
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "unknown">("unknown");
  const [videoDim, setVideoDim] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [userOverridden, setUserOverridden] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<string | null>(null);

  // Detect partner video stream orientation (loadedmetadata & resize events)
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    const handleVideoDimensions = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;

      const isPortrait = h > w;
      const newOrientation = isPortrait ? "portrait" : "landscape";
      setOrientation(newOrientation);
      setVideoDim({ width: w, height: h });

      // WA-style auto-behavior: If user hasn't explicitly locked a mode:
      // Portrait video on desktop defaults to "contain" so the full frame (head to body) isn't cropped!
      // Landscape video on desktop fills ("cover") naturally.
      if (!userOverridden) {
        setFitMode(isPortrait ? "contain" : "cover");
      }
    };

    video.addEventListener("loadedmetadata", handleVideoDimensions);
    video.addEventListener("resize", handleVideoDimensions);

    if (video.videoWidth) {
      handleVideoDimensions();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleVideoDimensions);
      video.removeEventListener("resize", handleVideoDimensions);
    };
  }, [remoteVideoRef, showRemoteVideo, userOverridden]);

  // Toggle fit mode manually
  const toggleFitMode = () => {
    setUserOverridden(true);
    setFitMode((prev) => {
      const next = prev === "contain" ? "cover" : "contain";
      setShowToast(next === "contain" ? "Mode: Sesuaikan Layar (Utuh)" : "Mode: Isi Layar (Penuh)");
      setTimeout(() => setShowToast(null), 2500);
      return next;
    });
  };

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
      onDoubleClick={showRemoteVideo ? toggleFitMode : undefined}
    >
      {/* Ambient Aurora Glow Backdrop when partner video is in "contain" mode */}
      {showRemoteVideo && fitMode === "contain" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {/* Subtle blurred aura circles */}
          <div
            style={{
              position: "absolute",
              top: "20%",
              left: "25%",
              width: "50vw",
              height: "50vw",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.08) 45%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "15%",
              right: "25%",
              width: "40vw",
              height: "40vw",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 65%)",
              filter: "blur(50px)",
            }}
          />
        </div>
      )}

      {/* Remote Video Stream Container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: showRemoteVideo ? "flex" : "none",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: fitMode === "cover" ? "100%" : "auto",
            height: fitMode === "cover" ? "100%" : "auto",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: fitMode,
            borderRadius: fitMode === "contain" && orientation === "portrait" ? 20 : 0,
            boxShadow:
              fitMode === "contain" && orientation === "portrait"
                ? "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)"
                : "none",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* WhatsApp-Style Orientation & Fit Mode Overlay Controls (Top-Right) */}
        {showRemoteVideo && (
          <div
            style={{
              position: "absolute",
              top: 76,
              right: 28,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(18, 22, 34, 0.8)",
              backdropFilter: "blur(16px)",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Orientation Indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
                paddingRight: 8,
                borderRight: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              {orientation === "portrait" ? (
                <>
                  <Smartphone size={13} color="#a5b4fc" />
                  <span>Potret (Auto)</span>
                </>
              ) : (
                <>
                  <Monitor size={13} color="#34d399" />
                  <span>Lanskap (Auto)</span>
                </>
              )}
            </div>

            {/* Toggle Fit / Fill Button */}
            <button
              onClick={toggleFitMode}
              title={fitMode === "contain" ? "Isi Layar (Zoom Penuh)" : "Sesuaikan Layar (Utuh)"}
              style={{
                background: "transparent",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 4px",
              }}
            >
              {fitMode === "contain" ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
              <span>{fitMode === "contain" ? "Sesuaikan" : "Penuh"}</span>
            </button>
          </div>
        )}

        {/* Notification Toast for Fit Mode Change */}
        {showToast && (
          <div
            className="animate-fade-in"
            style={{
              position: "absolute",
              bottom: 120,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              background: "rgba(10, 14, 24, 0.9)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 20,
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 500,
              color: "#fff",
            }}
          >
            {showToast}
          </div>
        )}
      </div>

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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", maxWidth: 420 }}>
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
                : status === "connecting-signaling"
                ? "Menghubungkan ke Room..."
                : "Siap Memulai Sleep Call"}
            </h3>

            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {status === "connected"
                ? partner.camera
                  ? "Kamera aktif"
                  : "Kamera partner mati (Audio tetap tersambung)"
                : status === "waiting-partner"
                ? "Buka aplikasi di Android atau perangkat partner"
                : status === "connecting-signaling"
                ? "Melakukan otentikasi dan handshake P2P..."
                : "Panggilan P2P privat dengan transmisi hemat daya & mode gelap OLED."}
            </p>

            {status === "disconnected" && onConnect && (
              <button
                onClick={onConnect}
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 28px",
                  borderRadius: "var(--radius-full)",
                  background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
                  border: "none",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 8px 24px rgba(99, 102, 241, 0.4)",
                  transition: "all 0.15s ease",
                }}
              >
                <PhoneCall size={16} />
                <span>Masuk Room Panggilan</span>
              </button>
            )}

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
