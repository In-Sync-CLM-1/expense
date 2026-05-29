import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isPlatformAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const checkRef = useRef(0);

  useEffect(() => {
    const handleSession = async (session: Session | null) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setLoading(true); // hold gates open while we verify platform_admin role
        const version = ++checkRef.current;
        try {
          const { data } = await supabase.rpc("has_role" as never, {
            _user_id: currentUser.id,
            _role: "platform_admin",
          });
          if (checkRef.current === version) {
            setIsPlatformAdmin(!!data);
            setLoading(false);
          }
        } catch {
          if (checkRef.current === version) {
            setIsPlatformAdmin(false);
            setLoading(false);
          }
        }
      } else {
        checkRef.current++;
        setIsPlatformAdmin(false);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    checkRef.current++;
    setSession(null);
    setUser(null);
    setIsPlatformAdmin(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, isPlatformAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
