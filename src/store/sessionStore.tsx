import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authClient } from "../lib/authClient";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type SessionState = {
  user: SessionUser | null;
  isLoading: boolean;
};

type SessionContextValue = SessionState & {
  /** Call after a successful sign-in to refresh session state. */
  refresh: () => Promise<void>;
  /** Sign out and clear session. */
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    user: null,
    isLoading: true,
  });

  const loadSession = useCallback(async () => {
    try {
      const { data } = await authClient.getSession();
      setState({
        user: data?.user
          ? { id: data.user.id, email: data.user.email, name: data.user.name }
          : null,
        isLoading: false,
      });
    } catch {
      setState({ user: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const refresh = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setState({ user: null, isLoading: false });
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
