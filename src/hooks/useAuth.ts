/**
 * useAuth Hook
 * Custom hook for accessing the AuthContext
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/auth-context-definition';

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};