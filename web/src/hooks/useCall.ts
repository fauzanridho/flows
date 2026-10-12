"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CallMode,
  ConnectionStatus,
  PeerRole,
  IceServerConfig,
  PartnerState,
  CallStats,
  DataChannelMessage,
  ServerMessage,
  ClientMessage,
} from "@/types/call";

// Helper to tune Opus SDP fmtp
function enhanceOpusSDP(sdp: string, mode: CallMode): string {
  const bitrate = mode === "deep-sleep" ? 16000 : mode === "sleep" ? 24000 : 32000;
  const opusFmtpRegex = /a=fmtp:(\d+) (.*)/g;

  return sdp.replace(opusFmtpRegex, (match, pt, params) => {
    if (params.includes("minptime=") || params.includes("useinbandfec=")) {
      // It's likely Opus; ensure DTX and optimal bitrate
      let updated = params;
      if (!updated.includes("usedtx=")) updated += ";usedtx=1";
      if (!updated.includes("useinbandfec=")) updated += ";useinbandfec=1";
      if (!updated.includes("stereo=")) updated += ";stereo=0";
      if (!updated.includes("ptime=")) updated += ";ptime=40";
      if (!updated.includes("maxaveragebitrate=")) {
        updated += `;maxaveragebitrate=${bitrate}`;
      } else {
        updated = updated.replace(/maxaveragebitrate=\d+/, `maxaveragebitrate=${bitrate}`);
      }
      return `a=fmtp:${pt} ${updated}`;
    }
    return match;
  });
}

// Generate persistent device ID
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "web-mac-default";
  const stored = localStorage.getItem("sleep_call_device_id");
  if (stored) return stored;
  const generated = "web-mac-" + Math.random().toString(36).substring(2, 10);
  localStorage.setItem("sleep_call_device_id", generated);
  return generated;
}

export function useCall() {
  // Configuration
  const [serverUrl, setServerUrl] = useState<string>("wss://sleep-call-signaling.fauzanridho.workers.dev/ws");
  const [token, setToken] = useState<string>("aef8cd2699d8fe5415f7e5e7c210b22bb5e02234f460a1b0427a2df734577f88");
  const [deviceId, setDeviceId] = useState<string>("");

  // States
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [role, setRole] = useState<PeerRole | null>(null);
  const [mode, setMode] = useState<CallMode>("normal");
  const [muted, setMuted] = useState<boolean>(false);
  const [cameraOn, setCameraOn] = useState<boolean>(false);

  // Blackout & Peek
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [isPeeking, setIsPeeking] = useState<boolean>(false);
  const peekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Partner State
  const [partner, setPartner] = useState<PartnerState>({
    online: false,
    muted: false,
    camera: false,
    screen: false,
    mode: "normal",
  });

  // Wake Lock & Stats
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [stats, setStats] = useState<CallStats>({});
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Refs for media and connections
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElementRef = useRef<HTMLVideoElement | null>(null);

  // Perfect negotiation tracking
  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);

  // Backoff reconnect & connection guard refs
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const connectingRef = useRef<boolean>(false);
  const userLeftRef = useRef<boolean>(false);

  // Stable refs for values used inside event listeners
  const tokenRef = useRef<string>(token);
  tokenRef.current = token;
  const serverUrlRef = useRef<string>(serverUrl);
  serverUrlRef.current = serverUrl;
  const deviceIdRef = useRef<string>(deviceId);
  deviceIdRef.current = deviceId;
  const roleRef = useRef<PeerRole | null>(role);
  roleRef.current = role;
  const modeRef = useRef<CallMode>(mode);
  modeRef.current = mode;

  // Initialize config on mount
  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    const savedUrl = localStorage.getItem("sleep_call_server_url");
    if (savedUrl && !savedUrl.includes("localhost") && !savedUrl.includes("127.0.0.1")) {
      setServerUrl(savedUrl);
    } else {
      const defaultCfUrl = "wss://sleep-call-signaling.fauzanridho.workers.dev/ws";
      setServerUrl(defaultCfUrl);
      localStorage.setItem("sleep_call_server_url", defaultCfUrl);
    }

    const savedToken = localStorage.getItem("sleep_call_token");
    if (savedToken) setToken(savedToken);
  }, []);

  // Save config
  const saveConfig = useCallback((newUrl: string, newToken: string) => {
    setServerUrl(newUrl);
    setToken(newToken);
    localStorage.setItem("sleep_call_server_url", newUrl);
    localStorage.setItem("sleep_call_token", newToken);
  }, []);

  // Show notice with auto hide
  const showNotice = useCallback((msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => {
      setNoticeMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  // ─── Wake Lock Management ──────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) return;
    try {
      if (!wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockActive(false);
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn("Failed to request Screen Wake Lock:", err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // Re-acquire Wake Lock on visibilitychange
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "connected" && !isBlackout) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status, isBlackout, requestWakeLock]);

  // ─── DataChannel Helpers ───────────────────────────────────────────────────
  const sendDataChannel = useCallback((msg: DataChannelMessage) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      try {
        dcRef.current.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        console.warn("Error sending via DataChannel:", e);
      }
    }
    // Fallback to signaling server if state message
    if (msg.t === "state" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const clientMsg: ClientMessage = {
        type: "state",
        muted: msg.muted,
        camera: msg.camera,
        screen: msg.screen,
        mode: msg.mode,
      };
      wsRef.current.send(JSON.stringify(clientMsg));
    }
    return false;
  }, []);

  // Read Battery status if supported
  const getBatteryLevel = useCallback(async (): Promise<number | undefined> => {
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      try {
        const battery: any = await (navigator as any).getBattery();
        return Math.round(battery.level * 100);
      } catch {}
    }
    return undefined;
  }, []);

  // Broadcast current state to partner
  const broadcastState = useCallback(async (
    isMuted = muted,
    isCam = cameraOn,
    scr = !isBlackout,
    currentMode = mode
  ) => {
    const bat = await getBatteryLevel();
    const msg: DataChannelMessage = {
      t: "state",
      muted: isMuted,
      camera: isCam,
      screen: scr,
      mode: currentMode,
      battery: bat,
      ts: Date.now(),
    };
    sendDataChannel(msg);
  }, [muted, cameraOn, isBlackout, mode, getBatteryLevel, sendDataChannel]);

  // Setup DataChannel listeners
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onopen = () => {
      console.log("[DataChannel] 'ctrl' channel opened");
      broadcastState();
    };

    dc.onmessage = (event) => {
      try {
        const msg: DataChannelMessage = JSON.parse(event.data);
        if (msg.t === "state") {
          setPartner((prev) => ({
            ...prev,
            muted: msg.muted,
            camera: msg.camera,
            screen: msg.screen,
            mode: msg.mode,
            battery: msg.battery,
            temp: msg.temp,
            lastSeenTs: msg.ts,
          }));
        } else if (msg.t === "req") {
          if (msg.want === "audio-only") {
            showNotice("Partner sedang tidur (mode hemat daya)");
          } else if (msg.want === "video") {
            showNotice("Partner membuka kembali layar");
          }
        } else if (msg.t === "notice") {
          if (msg.code === "thermal-down") {
            showNotice("Perangkat partner hangat — menurunkan resolusi");
          } else if (msg.code === "battery-low") {
            showNotice("Baterai partner di bawah 15%");
          } else if (msg.code === "timer-deep") {
            showNotice("Partner otomatis beralih ke Deep Sleep");
          }
        }
      } catch (err) {
        console.warn("Failed to parse datachannel message:", err);
      }
    };

    dc.onclose = () => {
      console.log("[DataChannel] 'ctrl' channel closed");
    };
  }, [broadcastState, showNotice]);

  // ─── Local Media Handling ──────────────────────────────────────────────────
  const setupLocalMedia = useCallback(async (enableCamera = false) => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        localStreamRef.current = stream;
      }

      if (enableCamera) {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24 },
          },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        setCameraOn(true);
      }

      // Attach to local video element preview
      if (localVideoElementRef.current && localStreamRef.current) {
        localVideoElementRef.current.srcObject = localStreamRef.current;
      }

      return localStreamRef.current;
    } catch (err) {
      console.error("Failed to access media devices:", err);
      showNotice("Gagal mengakses mikrofon/kamera");
      return null;
    }
  }, [showNotice]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = audioTrack.enabled; // if true, becomes false (muted)
      audioTrack.enabled = !nextMuted;
      setMuted(nextMuted);
      broadcastState(nextMuted, cameraOn, !isBlackout, mode);
      showNotice(nextMuted ? "Mikrofon dimatikan (Muted)" : "Mikrofon aktif");
    }
  }, [cameraOn, isBlackout, mode, broadcastState, showNotice]);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!stream) return;

    if (cameraOn) {
      // Turn Off Camera: stop track completely to power down hardware sensor & Mac LED
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        stream.removeTrack(videoTrack);
      }
      if (pc) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(null);
        }
      }
      setCameraOn(false);
      broadcastState(muted, false, !isBlackout, mode);
      showNotice("Kamera dimatikan");
    } else {
      // Turn On Camera: get new track with constraints
      try {
        const constraints =
          mode === "sleep"
            ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }
            : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };

        const camStream = await navigator.mediaDevices.getUserMedia({ video: constraints });
        const newTrack = camStream.getVideoTracks()[0];
        stream.addTrack(newTrack);

        if (localVideoElementRef.current) {
          localVideoElementRef.current.srcObject = stream;
        }

        if (pc) {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (videoSender) {
            await videoSender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, stream);
          }
        }

        setCameraOn(true);
        broadcastState(muted, true, !isBlackout, mode);
        showNotice("Kamera aktif");
      } catch (err) {
        console.error("Failed to enable camera:", err);
        showNotice("Gagal menyalakan kamera");
      }
    }
  }, [cameraOn, mode, muted, isBlackout, broadcastState, showNotice]);

  // Apply bitrate & constraints on mode change
  const applyModeMediaConstraints = useCallback(async (newMode: CallMode) => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;

    if (newMode === "deep-sleep") {
      // Deep Sleep: force camera OFF total
      if (cameraOn && stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          stream.removeTrack(videoTrack);
        }
        if (pc) {
          const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (videoSender) await videoSender.replaceTrack(null);
        }
        setCameraOn(false);
      }
    } else if (newMode === "sleep" && cameraOn && stream) {
      // Sleep Mode: lower capture to 320x240 @ 15fps
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15 },
          });
        } catch (e) {
          console.warn("Could not apply constraints:", e);
        }
      }
      // Lower maxBitrate on sender
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && sender.getParameters) {
          const params = sender.getParameters();
          if (params.encodings && params.encodings[0]) {
            params.encodings[0].maxBitrate = 180000;
            sender.setParameters(params).catch(() => {});
          }
        }
      }
    } else if (newMode === "normal" && cameraOn && stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24 },
          });
        } catch (e) {}
      }
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && sender.getParameters) {
          const params = sender.getParameters();
          if (params.encodings && params.encodings[0]) {
            params.encodings[0].maxBitrate = 600000;
            sender.setParameters(params).catch(() => {});
          }
        }
      }
    }
  }, [cameraOn]);

  // Change Mode
  const changeMode = useCallback((targetMode: CallMode) => {
    if (targetMode === mode) return;

    if (targetMode === "normal") {
      setCountdown(null);
      setIsBlackout(false);
      setMode("normal");
      applyModeMediaConstraints("normal");
      broadcastState(muted, cameraOn, true, "normal");
      sendDataChannel({ t: "req", want: "video" });
      requestWakeLock();
      showNotice("Mode Normal aktif");
    } else if (targetMode === "sleep") {
      setMode("sleep");
      applyModeMediaConstraints("sleep");
      // Start 10s countdown to blackout
      setCountdown(10);
      showNotice("Mode Sleep: Layar hitam dalam 10 detik");
    } else if (targetMode === "deep-sleep") {
      setCountdown(null);
      setMode("deep-sleep");
      setIsBlackout(true);
      applyModeMediaConstraints("deep-sleep");
      broadcastState(muted, false, false, "deep-sleep");
      sendDataChannel({ t: "req", want: "audio-only" });
      showNotice("Deep Sleep aktif (Audio only & Layar hitam)");
    }
  }, [mode, muted, cameraOn, applyModeMediaConstraints, broadcastState, sendDataChannel, requestWakeLock, showNotice]);

  // Handle countdown tick for Sleep mode
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setIsBlackout(true);
      broadcastState(muted, cameraOn, false, mode);
      sendDataChannel({ t: "req", want: "audio-only" });
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, muted, cameraOn, mode, broadcastState, sendDataChannel]);

  // Cancel countdown
  const cancelCountdown = useCallback(() => {
    setCountdown(null);
    setMode("normal");
    showNotice("Transisi layar hitam dibatalkan");
  }, [showNotice]);

  // Peek interaction during Blackout (mouse move / key press)
  const triggerPeek = useCallback(() => {
    if (!isBlackout) return;
    setIsPeeking(true);
    if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
    peekTimeoutRef.current = setTimeout(() => {
      setIsPeeking(false);
    }, 5000);
  }, [isBlackout]);

  // ─── WebRTC PeerConnection Setup ───────────────────────────────────────────
  const createPeerConnection = useCallback((role: PeerRole) => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      bundlePolicy: "max-bundle",
    });
    pcRef.current = pc;

    // Prefer H.264 video codec if supported
    try {
      const transceivers = pc.getTransceivers();
      const videoTransceiver = transceivers.find((t) => t.receiver.track.kind === "video");
      if (videoTransceiver && "setCodecPreferences" in videoTransceiver && "getCapabilities" in RTCRtpReceiver) {
        const capabilities = RTCRtpReceiver.getCapabilities("video");
        if (capabilities) {
          const h264Codecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
          const otherCodecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
          videoTransceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
        }
      }
    } catch (e) {
      console.warn("Could not set codec preferences:", e);
    }

    // ICE candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        const signalMsg: ClientMessage = {
          type: "signal",
          kind: "candidate",
          data: event.candidate,
        };
        wsRef.current.send(JSON.stringify(signalMsg));
      }
    };

    // Track event for remote audio/video
    pc.ontrack = (event) => {
      console.log("[WebRTC] Received remote track:", event.track.kind);
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      remoteStreamRef.current.addTrack(event.track);

      if (remoteVideoElementRef.current) {
        remoteVideoElementRef.current.srcObject = remoteStreamRef.current;
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] connectionState:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setStatus("connected");
        setPartner((prev) => ({ ...prev, online: true }));
        requestWakeLock();
        broadcastState();
      } else if (pc.connectionState === "failed") {
        setStatus("failed");
        showNotice("Koneksi P2P gagal, mencoba menghubungkan ulang...");
        pc.restartIce();
      } else if (pc.connectionState === "disconnected") {
        // Disconnected: wait 5s then restart ICE
        setTimeout(() => {
          if (pcRef.current?.connectionState === "disconnected") {
            pcRef.current.restartIce();
          }
        }, 5000);
      }
    };

    // Role-specific DataChannel creation
    if (role === "impolite") {
      const dc = pc.createDataChannel("ctrl", { ordered: true });
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === "ctrl") {
          setupDataChannel(event.channel);
        }
      };
    }

    // Add local tracks to PC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Negotiation helper for impolite peer or negotiationneeded
    const doNegotiate = async () => {
      const pc = pcRef.current;
      if (!pc || makingOfferRef.current) return;
      if (pc.signalingState !== "stable") {
        console.log("[WebRTC] Skip negotiate — signalingState is:", pc.signalingState);
        return;
      }
      try {
        makingOfferRef.current = true;
        console.log("[WebRTC] Creating offer...");
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
          console.log("[WebRTC] Aborting local offer — state changed to:", pc.signalingState);
          return;
        }

        const modifiedSdp = enhanceOpusSDP(offer.sdp || "", modeRef.current);
        const tunedOffer = new RTCSessionDescription({ type: "offer", sdp: modifiedSdp });

        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(tunedOffer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const signalMsg: ClientMessage = {
            type: "signal",
            kind: "offer",
            data: pc.localDescription,
          };
          wsRef.current.send(JSON.stringify(signalMsg));
        }
      } catch (err) {
        console.error("[WebRTC] Error creating offer:", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    // Negotiationneeded handler (Perfect negotiation)
    pc.onnegotiationneeded = () => {
      doNegotiate();
    };

    return pc;
  }, [requestWakeLock, broadcastState, setupDataChannel, showNotice]);

  // ─── WebSocket Signaling Connection ────────────────────────────────────────
  const connectSignaling = useCallback(async () => {
    const curToken = tokenRef.current;
    if (!curToken) {
      showNotice("Token rahasia belum dimasukkan!");
      return;
    }

    // Prevent duplicate concurrent connects if already connected or connecting
    if (connectingRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    userLeftRef.current = false;
    connectingRef.current = true;
    setStatus("connecting-signaling");

    const currentDeviceId = deviceIdRef.current || getOrCreateDeviceId();

    // Start local audio in background non-blocking so WebSocket handshake connects instantly
    setupLocalMedia(false)
      .then((stream) => {
        if (stream && pcRef.current) {
          stream.getTracks().forEach((track) => {
            const senders = pcRef.current?.getSenders() || [];
            if (!senders.some((s) => s.track === track)) {
              pcRef.current?.addTrack(track, stream);
            }
          });
        }
      })
      .catch((err) => {
        console.warn("setupLocalMedia non-blocking catch:", err);
      });

    // Build URL with query param token for browser compatibility
    let wsUrl = serverUrlRef.current.trim();
    if (wsUrl.startsWith("http://")) wsUrl = wsUrl.replace("http://", "ws://");
    if (wsUrl.startsWith("https://")) wsUrl = wsUrl.replace("https://", "wss://");

    const urlObj = new URL(wsUrl, window.location.href);
    urlObj.searchParams.set("token", curToken.trim());

    console.log("[Signaling] Connecting to:", urlObj.origin + urlObj.pathname);
    const ws = new WebSocket(urlObj.toString());
    wsRef.current = ws;

    ws.onopen = () => {
      connectingRef.current = false;
      console.log("[Signaling] WebSocket connected!");
      reconnectAttemptRef.current = 0;
      // Send join message
      const joinMsg: ClientMessage = {
        type: "join",
        deviceId: currentDeviceId,
        platform: "web-mac",
        appVersion: "1.0.0",
      };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = async (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "joined": {
            console.log(`[Signaling] Joined room as ${msg.role}. Peers in room:`, msg.peers);
            roleRef.current = msg.role;
            setRole(msg.role);
            if (msg.iceServers && msg.iceServers.length > 0) {
              iceServersRef.current = msg.iceServers.map((s) => ({
                urls: s.urls,
                username: s.username,
                credential: s.credential,
              }));
            }

            // Create RTCPeerConnection with assigned role
            const pc = createPeerConnection(msg.role);

            if (msg.peers.length === 0) {
              setStatus("waiting-partner");
            } else {
              setStatus("negotiating");
              const peerObj = msg.peers[0];
              const pId = typeof peerObj === "string" ? peerObj : (peerObj as any)?.deviceId;
              const pPlat = typeof peerObj === "object" ? (peerObj as any)?.platform : undefined;
              setPartner((prev) => ({ ...prev, online: true, deviceId: pId, platform: pPlat }));

              // Impolite peer initiates offer if partner is already present
              if (msg.role === "impolite") {
                setTimeout(async () => {
                  if (pc && pc.signalingState === "stable") {
                    try {
                      makingOfferRef.current = true;
                      const offer = await pc.createOffer();
                      const modifiedSdp = enhanceOpusSDP(offer.sdp || "", modeRef.current);
                      await pc.setLocalDescription(new RTCSessionDescription({ type: "offer", sdp: modifiedSdp }));
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                          type: "signal",
                          kind: "offer",
                          data: pc.localDescription,
                        }));
                      }
                    } catch (e) {
                      console.warn("Failed initial offer:", e);
                    } finally {
                      makingOfferRef.current = false;
                    }
                  }
                }, 150);
              }
            }
            break;
          }

          case "peer-joined": {
            console.log("[Signaling] Partner joined:", msg.deviceId);
            setStatus("negotiating");
            setPartner((prev) => ({
              ...prev,
              online: true,
              deviceId: msg.deviceId,
              platform: msg.platform,
            }));
            showNotice("Partner hadir! Tersambung otomatis.");

            // If we are impolite, initiate offer to newly arrived partner
            if (roleRef.current === "impolite") {
              const pc = pcRef.current;
              setTimeout(async () => {
                if (pc && pc.signalingState === "stable") {
                  try {
                    makingOfferRef.current = true;
                    const offer = await pc.createOffer();
                    const modifiedSdp = enhanceOpusSDP(offer.sdp || "", modeRef.current);
                    await pc.setLocalDescription(new RTCSessionDescription({ type: "offer", sdp: modifiedSdp }));
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({
                        type: "signal",
                        kind: "offer",
                        data: pc.localDescription,
                      }));
                    }
                  } catch (e) {
                    console.warn("Failed peer-joined offer:", e);
                  } finally {
                    makingOfferRef.current = false;
                  }
                }
              }, 150);
            }
            break;
          }

          case "peer-left": {
            console.log("[Signaling] Partner left:", msg.deviceId);
            setPartner((prev) => ({ ...prev, online: false }));
            showNotice("Partner sedang offline");
            break;
          }

          case "signal": {
            const pc = pcRef.current;
            if (!pc) return;

            const { kind, data } = msg;

            if (kind === "offer") {
              const offerCollision = makingOfferRef.current || pc.signalingState !== "stable";
              const currentRole = roleRef.current;
              ignoreOfferRef.current = (currentRole === "impolite") && offerCollision;

              if (ignoreOfferRef.current) {
                console.warn("[WebRTC] Glare detected — impolite peer ignoring offer");
                return;
              }

              if (offerCollision && currentRole === "polite") {
                console.log("[WebRTC] Glare detected — polite peer rolling back");
                await pc.setLocalDescription({ type: "rollback" } as any);
              }

              await pc.setRemoteDescription(new RTCSessionDescription(data));

              // Flush queued candidates
              while (pendingCandidatesRef.current.length > 0) {
                const cand = pendingCandidatesRef.current.shift();
                if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }

              const answer = await pc.createAnswer();
              const tunedSdp = enhanceOpusSDP(answer.sdp || "", modeRef.current);
              const tunedAnswer = new RTCSessionDescription({ type: "answer", sdp: tunedSdp });
              await pc.setLocalDescription(tunedAnswer);

              if (wsRef.current?.readyState === WebSocket.OPEN) {
                const answerSignal: ClientMessage = {
                  type: "signal",
                  kind: "answer",
                  data: pc.localDescription,
                };
                wsRef.current.send(JSON.stringify(answerSignal));
              }
            } else if (kind === "answer") {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(data));

                // Flush queued candidates
                while (pendingCandidatesRef.current.length > 0) {
                  const cand = pendingCandidatesRef.current.shift();
                  if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                }
              }
            } else if (kind === "candidate") {
              if (!pc.remoteDescription) {
                pendingCandidatesRef.current.push(data);
              } else {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data));
                } catch (e) {
                  if (!ignoreOfferRef.current) console.warn("Failed to add ICE candidate:", e);
                }
              }
            }
            break;
          }

          case "state": {
            setPartner((prev) => ({
              ...prev,
              muted: msg.muted,
              camera: msg.camera,
              screen: msg.screen,
              mode: msg.mode,
            }));
            break;
          }

          case "error": {
            console.error("[Signaling] Server error:", msg.code);
            if (msg.code === "bad-token") {
              setStatus("error");
              showNotice("Token rahasia salah (401 Unauthorized)");
            } else if (msg.code === "room-full") {
              setStatus("error");
              showNotice("Room penuh (maksimal 2 peserta)");
            } else if (msg.code === "replaced") {
              showNotice("Sesi digantikan oleh koneksi perangkat lain");
            }
            break;
          }

          case "pong":
            break;
        }
      } catch (err) {
        console.error("Failed to parse signaling message:", err);
      }
    };

    ws.onclose = () => {
      connectingRef.current = false;
      console.log("[Signaling] WebSocket closed");
      if (userLeftRef.current) return;
      // Do not reset peer connection if it is already connected directly peer-to-peer!
      if (pcRef.current?.connectionState !== "connected") {
        setStatus("disconnected");
      }

      // Schedule auto reconnect with exponential backoff (1s - 30s)
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 30000);
      reconnectAttemptRef.current += 1;
      console.log(`[Signaling] Reconnecting in ${Math.round(delay / 1000)}s...`);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSignaling();
      }, delay);
    };

    ws.onerror = (err) => {
      connectingRef.current = false;
      console.warn("[Signaling] WebSocket error:", err);
    };
  }, [setupLocalMedia, createPeerConnection, showNotice]);

  // Leave / Disconnect
  const leaveCall = useCallback(() => {
    userLeftRef.current = true;
    connectingRef.current = false;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "leave" }));
      wsRef.current.close();
    }
    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    releaseWakeLock();
    setStatus("disconnected");
    setRole(null);
    setCameraOn(false);
    setIsBlackout(false);
    setCountdown(null);
    setPartner({
      online: false,
      muted: false,
      camera: false,
      screen: false,
      mode: "normal",
    });
    showNotice("Panggilan diakhiri");
  }, [releaseWakeLock, showNotice]);

  // Stats collector loop
  useEffect(() => {
    if (!statsOpen || status !== "connected" || !pcRef.current) return;

    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const statsReport = await pc.getStats();
        let rtt: number | undefined;
        let bitrateIn: number | undefined;
        let bitrateOut: number | undefined;
        let candidateType: string | undefined;
        let jitter: number | undefined;
        let loss: number | undefined;

        statsReport.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            rtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : undefined;
          }
          if (report.type === "remote-candidate") {
            candidateType = report.candidateType; // host, srflx, relay
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            jitter = report.jitter ? Math.round(report.jitter * 1000) : undefined;
            if (report.packetsLost && report.packetsReceived) {
              loss = Math.round((report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100);
            }
          }
        });

        setStats({
          rttMs: rtt,
          candidateType,
          jitterMs: jitter,
          packetLossPercent: loss,
        });
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [statsOpen, status]);

  // Keyboard Shortcuts: M (mute), C (camera), 1/2/3 (modes), D (stats)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      triggerPeek();

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        toggleCamera();
      } else if (e.key === "1") {
        e.preventDefault();
        changeMode("normal");
      } else if (e.key === "2") {
        e.preventDefault();
        changeMode("sleep");
      } else if (e.key === "3") {
        e.preventDefault();
        changeMode("deep-sleep");
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setStatsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleMute, toggleCamera, changeMode, triggerPeek]);

  // Heartbeat state sync every 30s
  useEffect(() => {
    if (status !== "connected") return;
    const interval = setInterval(() => {
      broadcastState();
    }, 30000);
    return () => clearInterval(interval);
  }, [status, broadcastState]);

  return {
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
  };
}
