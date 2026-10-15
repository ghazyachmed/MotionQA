import { useCallback, useState } from "react";

const storageKey = "motionqa.operatorToken";

function readStoredToken(): string {
  try {
    return window.sessionStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

// AI Assisted Logic
// The token lives in sessionStorage for this tab only; it is never bundled into the build.
export function useOperatorToken(): { token: string; setToken: (token: string) => void } {
  const [token, setTokenState] = useState(readStoredToken);
  const setToken = useCallback((nextToken: string) => {
    const trimmedToken = nextToken.trim();
    setTokenState(trimmedToken);
    try {
      if (trimmedToken) {
        window.sessionStorage.setItem(storageKey, trimmedToken);
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      // Storage can be blocked; the token then lasts for this page view only.
    }
  }, []);
  return { token, setToken };
}
