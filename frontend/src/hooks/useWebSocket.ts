import { useEffect, useRef, useCallback, useState } from "react";
import { useTenantStore } from "@/stores/tenantStore";

const WS_URL = import.meta.env.VITE_WS_URL || "";

type MessageHandler = (msg: any) => void;

export function useWebSocket(handlers?: Record<string, MessageHandler>) {
  const { slug } = useTenantStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!slug) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = WS_URL || `${proto}//${window.location.host}`;
    const url = `${base}/ws/${slug}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type;
          if (type && handlersRef.current?.[type]) {
            handlersRef.current[type](msg);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect after 3s
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [slug]);

  const send = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected, ws: wsRef };
}
