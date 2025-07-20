import type { LoginCredentials, AuthResult, UserContext } from '../types/auth-types';
import { AuthErrorCode } from '../types/auth-types';

// Simulation functions (replace with actual API calls)
export async function simulateLogin(credentials: LoginCredentials): Promise<AuthResult> {
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

export async function simulateLogout(token: string): Promise<void> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('User logged out, token invalidated:', token.substring(0, 10) + '...');
}

export async function simulateTokenRefresh(/* _refreshToken: string */): Promise<AuthResult> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // For demo purposes, always succeed
  return {
    success: true,
    token: 'refreshed_token_' + Date.now(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  };
}