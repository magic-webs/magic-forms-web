"use client";

import * as React from "react";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

const convex = new ConvexReactClient(CONVEX_URL);
/**
 * A second, deliberately unauthenticated client for the auth actions
 * themselves — calling them through `convex` would re-enter the token fetch
 * that is asking for them.
 */
const authClient = new ConvexHttpClient(CONVEX_URL);

const STORAGE_KEY = "magicforms.refresh-token";

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing can refuse storage; the session just won't persist.
  }
}

// ---------------------------------------------------------------------------
// Token store — lives above ConvexProviderWithAuth so `useMagicAuth` can read it
// ---------------------------------------------------------------------------

type TokenStore = {
  ready: boolean;
  refreshToken: string | null;
  setRefreshToken: (token: string | null) => void;
};

const TokenStoreContext = React.createContext<TokenStore | null>(null);

/**
 * The `useAuth` hook Convex calls. Defined at module scope so its identity is
 * stable — a changing `useAuth` prop resets the client's auth state to loading.
 */
function useMagicAuth() {
  const store = React.useContext(TokenStoreContext);
  if (!store) throw new Error("Token store missing above ConvexProviderWithAuth.");
  const { ready, refreshToken, setRefreshToken } = store;

  const fetchAccessToken = React.useCallback(async () => {
    const token = refreshToken ?? readStoredToken();
    if (!token) return null;
    try {
      const result = await authClient.action(api.auth.refresh, {
        refreshToken: token,
      });
      if (!result) {
        // The session was revoked or expired server-side.
        setRefreshToken(null);
        return null;
      }
      return result.accessToken;
    } catch {
      return null;
    }
  }, [refreshToken, setRefreshToken]);

  return React.useMemo(
    () => ({
      isLoading: !ready,
      isAuthenticated: refreshToken !== null,
      fetchAccessToken,
    }),
    [ready, refreshToken, fetchAccessToken],
  );
}

// ---------------------------------------------------------------------------
// Session context — what pages use to sign in and out
// ---------------------------------------------------------------------------

type Session = {
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (args: {
    name: string;
    email: string;
    password: string;
    workspaceName?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = React.createContext<Session | null>(null);

export function useSession(): Session {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <Providers>.");
  return value;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [refreshToken, setToken] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  // localStorage is unavailable during the server render, so the stored session
  // is picked up once on mount. This is the external-store case the lint rule
  // cannot distinguish from prop-copying.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(readStoredToken());
    setReady(true);
  }, []);

  const setRefreshToken = React.useCallback((token: string | null) => {
    writeStoredToken(token);
    setToken(token);
  }, []);

  const userAgent = () =>
    typeof navigator === "undefined" ? undefined : navigator.userAgent;

  const session = React.useMemo<Session>(
    () => ({
      isLoading: !ready,
      isAuthenticated: refreshToken !== null,
      signIn: async (email, password) => {
        const result = await authClient.action(api.auth.signIn, {
          email,
          password,
          userAgent: userAgent(),
        });
        setRefreshToken(result.refreshToken);
      },
      signUp: async ({ name, email, password, workspaceName }) => {
        const result = await authClient.action(api.auth.signUp, {
          name,
          email,
          password,
          workspaceName,
          userAgent: userAgent(),
        });
        setRefreshToken(result.refreshToken);
      },
      signOut: async () => {
        const token = refreshToken;
        setRefreshToken(null);
        if (token) {
          try {
            await authClient.action(api.auth.signOut, { refreshToken: token });
          } catch {
            // Local session is already cleared; a failed server call is harmless.
          }
        }
      },
    }),
    [ready, refreshToken, setRefreshToken],
  );

  const store = React.useMemo<TokenStore>(
    () => ({ ready, refreshToken, setRefreshToken }),
    [ready, refreshToken, setRefreshToken],
  );

  return (
    <TokenStoreContext.Provider value={store}>
      <SessionContext.Provider value={session}>
        <ConvexProviderWithAuth client={convex} useAuth={useMagicAuth}>
          {children}
        </ConvexProviderWithAuth>
      </SessionContext.Provider>
    </TokenStoreContext.Provider>
  );
}
