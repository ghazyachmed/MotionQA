import { useCallback, useEffect, useRef, useState } from "react";
import { isInspectionResult, retainRecentEvents } from "../lib/qcMetrics";
import type { InspectionResult } from "../types/qcTypes";

export type StreamConnectionState = "CONNECTING" | "OPEN" | "CLOSED" | "ERROR" | "UNAUTHORIZED";

interface QcStreamState {
  recentEvents: InspectionResult[];
  connectionState: StreamConnectionState;
  upsertEvent: (event: InspectionResult) => void;
}

const policyViolationCode = 1008;

// AI Assisted Logic
export function useQcStream(wsUrl: string, token: string): QcStreamState {
  const [recentEvents, setRecentEvents] = useState<InspectionResult[]>([]);
  const [connectionState, setConnectionState] = useState<StreamConnectionState>("CONNECTING");
  const frameRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<InspectionResult[]>([]);

  const flushEvents = useCallback(() => {
    const pendingEvents = pendingEventsRef.current;
    pendingEventsRef.current = [];
    frameRef.current = null;
    setRecentEvents((events) => pendingEvents.reduce((current, event) => retainRecentEvents(current, event, 50), events));
  }, []);

  const upsertEvent = useCallback((event: InspectionResult) => {
    setRecentEvents((events) => retainRecentEvents(events, event, 50));
  }, []);

  useEffect(() => {
    let reconnectTimer: number | undefined;
    let isMounted = true;
    let socket: WebSocket | null = null;

    const connectSocket = () => {
      setConnectionState("CONNECTING");
      socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      socket.onopen = () => setConnectionState("OPEN");
      socket.onerror = () => setConnectionState("ERROR");
      socket.onmessage = (message) => {
        try {
          const payload: unknown = JSON.parse(message.data as string);
          if (!isInspectionResult(payload)) {
            return;
          }
          pendingEventsRef.current.push(payload);
          if (frameRef.current === null) {
            frameRef.current = requestAnimationFrame(flushEvents);
          }
        } catch {
          // Ignore malformed frames; the stream continues.
        }
      };
      socket.onclose = (closeEvent) => {
        if (closeEvent.code === policyViolationCode) {
          setConnectionState("UNAUTHORIZED");
          return;
        }
        setConnectionState("CLOSED");
        if (isMounted) {
          reconnectTimer = window.setTimeout(connectSocket, 2000);
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
  }, [flushEvents, token, wsUrl]);

  return { recentEvents, connectionState, upsertEvent };
}
