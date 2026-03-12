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
import { normalizeUser } from "../lib/apiClient";

const AUTH_TOKEN_KEY = "jninty_auth_token";

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN":
      localStorage.setItem(AUTH_TOKEN_KEY, action.payload.token);
      return {
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        isLoading: false,
      };
    case "LOGOUT":
      localStorage.removeItem(AUTH_TOKEN_KEY);
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
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token || !apiUrl) {
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((raw: Record<string, unknown>) => {
        // /auth/me may return the user directly or wrapped in { user: ... }
        const userData = (raw["user"] ?? raw) as Record<string, unknown>;
        dispatch({ type: "LOGIN", payload: { user: normalizeUser(userData), token } });
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
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
