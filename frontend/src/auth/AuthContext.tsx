import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { signIn, confirmSignIn, signOut, fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  groups: string[];
  isAdmin: boolean;
  sub: string | null;
  email: string | null;
  sessionId: string | null;
  error: string | null;
}

interface AuthActions {
  initiateSignIn: (email: string) => Promise<void>;
  confirmOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  getCredentials: () => Promise<import('@aws-sdk/types').AwsCredentialIdentity>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    groups: [],
    isAdmin: false,
    sub: null,
    email: null,
    sessionId: null,
    error: null,
  });

  // Check existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) throw new Error('No ID token');

      const groups = (idToken.payload['cognito:groups'] as string[]) ?? [];
      const sub = idToken.payload.sub as string;
      const email = idToken.payload.email as string;

      // Derive sessionId from sessionStorage or create new one (min 33 chars for AgentCore)
      let sessionId = sessionStorage.getItem('aura_session_id');
      if (!sessionId) {
        sessionId = `aura-${crypto.randomUUID()}`;
        sessionStorage.setItem('aura_session_id', sessionId);
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        groups,
        isAdmin: groups.includes('admin'),
        sub,
        email,
        sessionId,
        error: null,
      });
    } catch {
      setState(prev => ({ ...prev, isLoading: false, isAuthenticated: false }));
    }
  }

  const initiateSignIn = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null }));
    try {
      // Attempt sign-up first (no-op if user exists, creates if new)
      try {
        const { signUp } = await import('aws-amplify/auth');
        await signUp({
          username: email,
          password: crypto.randomUUID() + 'Aa1!', // Dummy password (never used, EMAIL_OTP is the auth method)
          options: { userAttributes: { email } },
        });
      } catch (signUpErr: unknown) {
        // UsernameExistsException is expected for existing users — ignore it
        const errName = (signUpErr as { name?: string }).name;
        if (errName !== 'UsernameExistsException') {
          // Log but don't block — signIn may still work
          console.log('SignUp skipped:', errName);
        }
      }

      await signIn({
        username: email,
        options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setState(prev => ({ ...prev, error: msg }));
      throw e;
    }
  }, []);

  const confirmOtp = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, error: null }));
    try {
      const result = await confirmSignIn({ challengeResponse: code });
      if (result.isSignedIn) {
        await checkSession();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid code';
      setState(prev => ({ ...prev, error: msg }));
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    sessionStorage.removeItem('aura_session_id');
    setState({
      isAuthenticated: false,
      isLoading: false,
      groups: [],
      isAdmin: false,
      sub: null,
      email: null,
      sessionId: null,
      error: null,
    });
  }, []);

  const getCredentials = useCallback(async () => {
    const session = await fetchAuthSession();
    if (!session.credentials) throw new Error('No credentials');
    return session.credentials;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, initiateSignIn, confirmOtp, logout, getCredentials }}>
      {children}
    </AuthContext.Provider>
  );
}
