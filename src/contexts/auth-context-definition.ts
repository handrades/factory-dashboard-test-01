/**
 * Auth Context Definition
 * Defines the auth context type and creates the context
 */

import { createContext } from 'react';
import type { UserContext } from '../types/auth-types';

export interface AuthContextType {
  // Authentication state
  isAuthenticated: boolean;
  user: UserContext | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  sessionExpiry: Date | null;

  // Authentication methods
  login: (credentials: { username: string; password: string; rememberMe?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  clearError: () => void;
  
  // User session management
  isSessionValid: () => boolean;
  getSessionTimeRemaining: () => number;
  getUserPermissions: () => string[];
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);