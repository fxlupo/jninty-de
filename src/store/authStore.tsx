import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import { isCloudEnabled, apiUrl } from "../config/cloud";
import type { AuthState, AuthAction } from "../types/auth";
import { normalizeUser, logoutFromServer, clearLegacyToken } from "../lib/apiClient";

/**
 * localStorage key — kept temporarily for migration fallback.
 * TODO: Remove after migration period (~7 days post-deploy).
 */
const LEGACY_TOKEN_KEY = "jninty_auth_token";

/** Check whether the non-HttpOnly companion cookie is set. */
function hasLoggedInCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith("jninty_logged_in="));
}

/** Check whether a legacy localStorage token exists (migration fallback). */
function getLegacyToken(): string | null {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN":
      return {
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token ?? null,
        isLoading: false,
      };
    case "LOGOUT":
      // Clear server cookies + legacy localStorage
      void logoutFromServer();
      clearLegacyToken();
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isLoading: false,
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "UPDATE_USER":
      if (!state.user) return state;
      return { ...state, user: { ...state.user, ...action.payload } };
  }
}

interface AuthContextValue {
  state: AuthState;
  dispatch: Dispatch<AuthAction>;
}

const noopState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: false,
};

const AuthContext = createContext<AuthContextValue>({
  state: noopState,
  dispatch: () => undefined,
});

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const fetchingRef = useRef(false);
  useEffect(() => {
    // Primary: check for the non-HttpOnly companion cookie
    const hasCookie = hasLoggedInCookie();
    // Migration fallback: check localStorage for a legacy token
    const legacyToken = getLegacyToken();

    if ((!hasCookie && !legacyToken) || !apiUrl) {
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const headers: Record<string, string> = {};
    // Migration: if we have a legacy token but no cookie yet, send it as Bearer
    if (!hasCookie && legacyToken) {
      headers["Authorization"] = `Bearer ${legacyToken}`;
    }

    fetch(`${apiUrl}/auth/me`, {
      headers,
      credentials: "include", // send HttpOnly cookie
    })
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((raw: Record<string, unknown>) => {
        // /auth/me may return the user directly or wrapped in { user: ... }
        const userData = (raw["user"] ?? raw) as Record<string, unknown>;
        dispatch({ type: "LOGIN", payload: { user: normalizeUser(userData) } });
        // If we validated a legacy token, the server should now have set
        // the HttpOnly cookie. Clean up localStorage.
        if (legacyToken) {
          clearLegacyToken();
        }
      })
      .catch(() => {
        clearLegacyToken();
        dispatch({ type: "LOGOUT" });
        fetchingRef.current = false;
      });
  }, []);

  return (
    <AuthContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isCloudEnabled) {
    return (
      <AuthContext.Provider value={{ state: noopState, dispatch: () => undefined }}>
        {children}
      </AuthContext.Provider>
    );
  }
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIsAuthenticated(): boolean {
  const { state } = useAuth();
  return state.isAuthenticated;
}
