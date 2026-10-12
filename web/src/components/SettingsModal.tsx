"use client";

import React, { useState } from "react";
import { X, Server, Key, Terminal, Copy, Check, Info, ShieldCheck } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentServerUrl: string;
  currentToken: string;
  onSave: (serverUrl: string, token: string) => void;
  onReconnect: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentServerUrl,
  currentToken,
  onSave,
  onReconnect,
}) => {
  const [url, setUrl] = useState<string>(currentServerUrl);
  const [token, setToken] = useState<string>(currentToken);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(url.trim(), token.trim());
    onClose();
    onReconnect();
  };

  const copyCaffeinate = () => {
    navigator.clipboard.writeText("caffeinate -i");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel-heavy"
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 24,
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Pengaturan Sleep Call</h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Server URL */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <Server size={13} />
              Signaling Server URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="wss://sleep-call-signaling.fauzanridho.workers.dev/ws"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Room Token */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <Key size={13} />
              Room Secret Token (Wajib Cocok dengan Server)
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Minimal 32 karakter token rahasia"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Mac Sleep Prevention Banner */}
          <div
            style={{
              padding: 14,
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 600 }}>
              <ShieldCheck size={14} />
              Tips Penggunaan Semalaman di Mac
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Aplikasi ini otomatis mengaktifkan <strong>Screen Wake Lock</strong>. Agar Mac tetap aktif 6-8 jam tanpa tidur saat charger terhubung, Anda juga bisa menjalankan perintah berikut di Terminal Mac:
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(0, 0, 0, 0.6)",
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <code style={{ fontSize: 12, color: "#34d399", fontFamily: "var(--font-geist-mono)" }}>
                caffeinate -i
              </code>
              <button
                onClick={copyCaffeinate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                <span>{copied ? "Tersalin" : "Salin"}</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Tutup
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "8px 18px",
                background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Simpan & Sambungkan Ulang
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
