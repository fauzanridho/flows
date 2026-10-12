"use client";

import React, { useState, useEffect } from "react";
import { useCall } from "@/hooks/useCall";
import { Header } from "@/components/Header";
import { VideoStage } from "@/components/VideoStage";
import { ControlBar } from "@/components/ControlBar";
import { BlackoutOverlay } from "@/components/BlackoutOverlay";
import { StatsDrawer } from "@/components/StatsDrawer";
import { SettingsModal } from "@/components/SettingsModal";
import { Sparkles, Maximize2, Minimize2 } from "lucide-react";

export default function Home() {
  const {
    serverUrl,
    token,
    deviceId,
    saveConfig,
    status,
    role,
    mode,
    changeMode,
    muted,
    toggleMute,
    cameraOn,
    toggleCamera,
    countdown,
    cancelCountdown,
    isBlackout,
    isPeeking,
    triggerPeek,
    partner,
    wakeLockActive,
    stats,
    statsOpen,
    setStatsOpen,
    noticeMessage,
    connectSignaling,
    leaveCall,
    localVideoElementRef,
    remoteVideoElementRef,
  } = useCall();

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Fullscreen shortcut listener (F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <main
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#06070a",
      }}
      onMouseMove={triggerPeek}
    >
      {/* Toast Notice Banner */}
      {noticeMessage && (
        <div
          className="animate-fade-in"
          style={{
            position: "fixed",
            top: 76,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 45,
            padding: "8px 18px",
            background: "rgba(18, 22, 34, 0.92)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--border-glow)",
            borderRadius: "var(--radius-full)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
            fontSize: 12,
            fontWeight: 500,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={14} color="var(--accent-indigo)" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        status={status}
        role={role}
        partner={partner}
        wakeLockActive={wakeLockActive}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleStats={() => setStatsOpen(!statsOpen)}
        statsOpen={statsOpen}
      />

      {/* Main Video & Audio Stage */}
      <VideoStage
        remoteVideoRef={remoteVideoElementRef}
        localVideoRef={localVideoElementRef}
        partner={partner}
        status={status}
        cameraOn={cameraOn}
        muted={muted}
        onConnect={connectSignaling}
      />

      {/* Floating Bottom Control Bar */}
      <ControlBar
        status={status}
        muted={muted}
        cameraOn={cameraOn}
        mode={mode}
        countdown={countdown}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onChangeMode={changeMode}
        onCancelCountdown={cancelCountdown}
        onConnect={connectSignaling}
        onLeave={leaveCall}
      />

      {/* Pitch-black Sleep Overlay with Dimmed 5s Peek HUD */}
      <BlackoutOverlay
        isBlackout={isBlackout}
        isPeeking={isPeeking}
        onTriggerPeek={triggerPeek}
        muted={muted}
        cameraOn={cameraOn}
        mode={mode}
        partner={partner}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onWakeScreen={() => changeMode("normal")}
      />

      {/* Connection Stats Drawer */}
      <StatsDrawer
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        stats={stats}
        role={role}
        deviceId={deviceId}
        partner={partner}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentServerUrl={serverUrl}
        currentToken={token}
        onSave={saveConfig}
        onReconnect={connectSignaling}
      />

      {/* Fullscreen Button (Bottom-Right Shortcut) */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-glass)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
          backdropFilter: "blur(16px)",
          cursor: "pointer",
          zIndex: 25,
          transition: "all 0.15s ease",
        }}
        title="Fullscreen (F)"
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </main>
  );
}
