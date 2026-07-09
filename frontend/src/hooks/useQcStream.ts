import { useCallback, useEffect, useRef, useState } from "react";
import { retainRecentEvents } from "../lib/qcMetrics";
import type { LiveQcEvent } from "../types/qcTypes";

interface QcStreamState {
  currentEvent: LiveQcEvent | null;
  recentEvents: LiveQcEvent[];
  connectionState: "CONNECTING" | "OPEN" | "CLOSED" | "ERROR";
}

// AI Assisted Logic
export function useQcStream(wsUrl: string): QcStreamState {
  const [currentEvent, setCurrentEvent] = useState<LiveQcEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveQcEvent[]>([]);
  const [connectionState, setConnectionState] = useState<QcStreamState["connectionState"]>("CONNECTING");
  const frameRef = useRef<number | null>(null);
  const pendingEventRef = useRef<LiveQcEvent | null>(null);

  const flushEvent = useCallback(() => {
    const pendingEvent = pendingEventRef.current;
    if (!pendingEvent) {
      return;
    }
    setCurrentEvent(pendingEvent);
    setRecentEvents((events) => retainRecentEvents(events, pendingEvent, 24));
    pendingEventRef.current = null;
    frameRef.current = null;
  }, []);

  useEffect(() => {
    let reconnectTimer: number | undefined;
    let isMounted = true;
    let socket: WebSocket | null = null;

    const connectSocket = () => {
      setConnectionState("CONNECTING");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => setConnectionState("OPEN");
      socket.onerror = () => setConnectionState("ERROR");
      socket.onmessage = (event) => {
        pendingEventRef.current = JSON.parse(event.data) as LiveQcEvent;
        if (frameRef.current === null) {
          frameRef.current = requestAnimationFrame(flushEvent);
        }
      };
      socket.onclose = () => {
        setConnectionState("CLOSED");
        if (isMounted) {
          reconnectTimer = window.setTimeout(connectSocket, 1200);
        }
      };
    };

    connectSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      socket?.close();
    };
  }, [flushEvent, wsUrl]);

  return { currentEvent, recentEvents, connectionState };
}

