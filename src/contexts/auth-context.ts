import { createContext } from 'react';
import type { UserContext, LoginCredentials, AuthResult } from '../types/auth-types';

interface AuthState {
  isAuthenticated: boolean;
  user: UserContext | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  sessionExpiry: Date | null;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  clearError: () => void;
  hasPermission: (resource: string, action?: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isTokenExpired: () => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);