/**
 * Authentication Context
 * Provides authentication state and methods throughout the React application
 */

import { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { UserContext, LoginCredentials, AuthResult } from '../types/auth-types';
import { AuthErrorCode } from '../types/auth-types';

interface AuthState {
  isAuthenticated: boolean;
  user: UserContext | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  sessionExpiry: Date | null;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  clearError: () => void;
  hasPermission: (resource: string, action?: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isTokenExpired: () => boolean;
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: UserContext; token: string; refreshToken: string; expiresAt: Date } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'REFRESH_SUCCESS'; payload: { token: string; expiresAt: Date } }
  | { type: 'REFRESH_FAILURE' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  refreshToken: null,
  loading: true,
  error: null,
  sessionExpiry: null
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        loading: true,
        error: null
      };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        sessionExpiry: action.payload.expiresAt,
        loading: false,
        error: null
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
        sessionExpiry: null,
        loading: false,
        error: action.payload
      };

    case 'LOGOUT':
      return {
        ...initialState,
        loading: false
      };

    case 'REFRESH_SUCCESS':
      return {
        ...state,
        token: action.payload.token,
        sessionExpiry: action.payload.expiresAt,
        error: null
      };

    case 'REFRESH_FAILURE':
      return {
        ...initialState,
        loading: false,
        error: 'Session expired. Please log in again.'
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };

    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Storage keys
  const TOKEN_KEY = 'factory_dashboard_token';
  const REFRESH_TOKEN_KEY = 'factory_dashboard_refresh_token';
  const USER_KEY = 'factory_dashboard_user';
  const EXPIRY_KEY = 'factory_dashboard_expiry';

  // Initialize authentication state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const userStr = localStorage.getItem(USER_KEY);
        const expiryStr = localStorage.getItem(EXPIRY_KEY);

        if (token && refreshToken && userStr && expiryStr) {
          const user = JSON.parse(userStr) as UserContext;
          const expiry = new Date(expiryStr);

          // Check if token is expired
          if (expiry > new Date()) {
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                user,
                token,
                refreshToken,
                expiresAt: expiry
              }
            });
          } else {
            // Try to refresh token
            const refreshed = await refreshAuth();
            if (!refreshed) {
              clearStoredAuth();
              dispatch({ type: 'LOGOUT' });
            }
          }
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        clearStoredAuth();
        dispatch({ type: 'LOGOUT' });
      }
    };

    initializeAuth();
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!state.isAuthenticated || !state.sessionExpiry) return;

    const timeUntilExpiry = state.sessionExpiry.getTime() - Date.now();
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000); // 5 minutes before expiry, minimum 1 minute

    const refreshTimer = setTimeout(async () => {
      const refreshed = await refreshAuth();
      if (!refreshed) {
        await logout();
      }
    }, refreshTime);

    return () => clearTimeout(refreshTimer);
  }, [state.sessionExpiry, state.isAuthenticated]);

  const login = async (credentials: LoginCredentials): Promise<AuthResult> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      // This would typically make an API call to your authentication service
      // For now, we'll simulate the authentication process
      const response = await simulateLogin(credentials);

      if (response.success && response.user && response.token && response.refreshToken && response.expiresAt) {
        // Store authentication data
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        localStorage.setItem(EXPIRY_KEY, response.expiresAt.toISOString());

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: response.user,
            token: response.token,
            refreshToken: response.refreshToken,
            expiresAt: response.expiresAt
          }
        });

        return response;
      } else {
        const errorMessage = response.error || 'Login failed';
        dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
        return response;
      }
    } catch (error) {
      const errorMessage = 'Network error. Please try again.';
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      return {
        success: false,
        error: errorMessage,
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // This would typically make an API call to invalidate the token
      if (state.token) {
        await simulateLogout(state.token);
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      clearStoredAuth();
      dispatch({ type: 'LOGOUT' });
    }
  };

  const refreshAuth = async (): Promise<boolean> => {
    if (!state.refreshToken) {
      return false;
    }

    try {
      // This would typically make an API call to refresh the token
      const response = await simulateTokenRefresh(state.refreshToken);

      if (response.success && response.token && response.expiresAt) {
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(EXPIRY_KEY, response.expiresAt.toISOString());

        dispatch({
          type: 'REFRESH_SUCCESS',
          payload: {
            token: response.token,
            expiresAt: response.expiresAt
          }
        });

        return true;
      } else {
        dispatch({ type: 'REFRESH_FAILURE' });
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      dispatch({ type: 'REFRESH_FAILURE' });
      return false;
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const hasPermission = (resource: string, action?: string): boolean => {
    if (!state.user?.permissions) return false;
    
    // If only resource is provided, check if user has any permission for that resource
    if (!action) {
      return state.user.permissions.some(p => p.resource === resource);
    }
    
    // Check if user has specific resource:action permission
    return state.user.permissions.some(p => 
      p.resource === resource && p.actions.includes(action)
    );
  };

  const hasRole = (role: string): boolean => {
    return state.user?.roles.includes(role) || false;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some(role => state.user?.roles.includes(role)) || false;
  };

  const isTokenExpired = (): boolean => {
    if (!state.sessionExpiry) return true;
    return state.sessionExpiry <= new Date();
  };

  const clearStoredAuth = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  };

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    refreshAuth,
    clearError,
    hasPermission,
    hasRole,
    hasAnyRole,
    isTokenExpired
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Simulation functions (replace with actual API calls)
async function simulateLogin(credentials: LoginCredentials): Promise<AuthResult> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simple validation for demo purposes
  if (credentials.username === 'admin' && credentials.password === 'admin123') {
    const user: UserContext = {
      id: 'user_admin_demo',
      username: 'admin',
      email: 'admin@factory-dashboard.local',
      roles: ['admin'],
      permissions: [
        'dashboard:view',
        'dashboard:manage',
        'equipment:view',
        'equipment:control',
        'equipment:configure',
        'data:view',
        'data:export',
        'data:delete',
        'users:view',
        'users:manage',
        'users:delete',
        'system:view',
        'system:configure',
        'security:manage',
        'logs:view'
      ],
      sessionId: 'session_' + Date.now()
    };

    return {
      success: true,
      user,
      token: 'demo_token_' + Date.now(),
      refreshToken: 'demo_refresh_' + Date.now(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    };
  } else if (credentials.username === 'operator' && credentials.password === 'operator123') {
    const user: UserContext = {
      id: 'user_operator_demo',
      username: 'operator',
      email: 'operator@factory-dashboard.local',
      roles: ['operator'],
      permissions: [
        'dashboard:view',
        'equipment:view',
        'equipment:control',
        'data:view',
        'data:export',
        'system:view'
      ],
      sessionId: 'session_' + Date.now()
    };

    return {
      success: true,
      user,
      token: 'demo_token_' + Date.now(),
      refreshToken: 'demo_refresh_' + Date.now(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    };
  } else {
    return {
      success: false,
      error: 'Invalid username or password',
      errorCode: AuthErrorCode.INVALID_CREDENTIALS
    };
  }
}

async function simulateLogout(token: string): Promise<void> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('User logged out, token invalidated:', token.substring(0, 10) + '...');
}

async function simulateTokenRefresh(refreshToken: string): Promise<AuthResult> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // For demo purposes, always succeed
  return {
    success: true,
    token: 'refreshed_token_' + Date.now(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  };
}