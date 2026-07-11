import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import { isCloudEnabled, apiUrl } from "../config/cloud";
import type { AuthState, AuthAction } from "../types/auth";
import {
  normalizeUser,
  logoutFromServer,
  clearLoggedInCookie,
  hasLoggedInCookie,
} from "../lib/apiClient";

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: true,
};

/** Pure reducer — no side effects. */
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
  /** Perform a full logout: clear cookies, localStorage, call server, update state. */
  performLogout: () => void;
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
  performLogout: () => undefined,
});

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /**
   * Full logout with side effects — used for explicit user sign-out.
   * Clears companion cookie (synchronous), legacy localStorage, calls server,
   * and dispatches LOGOUT to update state.
   */
  const performLogout = useCallback(() => {
    clearLoggedInCookie();
    void logoutFromServer();
    dispatch({ type: "LOGOUT" });
  }, []);

  /**
   * Silent logout — used when session validation fails (401 from /auth/me).
   * Clears local state but does NOT call logoutFromServer() since the server
   * already knows the session is invalid.
   */
  const silentLogout = useCallback(() => {
    clearLoggedInCookie();
    dispatch({ type: "LOGOUT" });
  }, []);

  const fetchingRef = useRef(false);
  useEffect(() => {
    const hasCookie = hasLoggedInCookie();

    if (!hasCookie || !apiUrl) {
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    fetch(`${apiUrl}/auth/me`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((raw: Record<string, unknown>) => {
        const userData = (raw["user"] ?? raw) as Record<string, unknown>;
        dispatch({ type: "LOGIN", payload: { user: normalizeUser(userData) } });
        fetchingRef.current = false;
      })
      .catch(() => {
        silentLogout();
        fetchingRef.current = false;
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ state, dispatch, performLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isCloudEnabled) {
    return (
      <AuthContext.Provider
        value={{ state: noopState, dispatch: () => undefined, performLogout: () => undefined }}
      >
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
