/**
 * Authentication and Authorization Type Definitions
 */

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  lastLogin?: Date;
  failedLoginAttempts: number;
  accountLocked: boolean;
  lockoutExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface Role {
  id: string;
  name: string;
  permissions: PermissionInterface[];
  description: string;
  isSystemRole: boolean;
  createdAt: Date;
}

export interface PermissionInterface {
  id: string;
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
  description: string;
}

export interface AuthToken {
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  issuedAt: Date;
  ipAddress: string;
  userAgent: string;
  isRevoked: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: UserContext;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface UserContext {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  lastLogin?: Date;
  sessionId: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserRegistrationRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
} as const;

export type AuthErrorCode = typeof AuthErrorCode[keyof typeof AuthErrorCode];

export const UserRole = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  MAINTENANCE: 'maintenance'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const Permission = {
  // Dashboard permissions
  VIEW_DASHBOARD: 'dashboard:view',
  MANAGE_DASHBOARD: 'dashboard:manage',
  
  // Equipment permissions
  VIEW_EQUIPMENT: 'equipment:view',
  CONTROL_EQUIPMENT: 'equipment:control',
  CONFIGURE_EQUIPMENT: 'equipment:configure',
  
  // Data permissions
  VIEW_DATA: 'data:view',
  EXPORT_DATA: 'data:export',
  DELETE_DATA: 'data:delete',
  
  // User management permissions
  VIEW_USERS: 'users:view',
  MANAGE_USERS: 'users:manage',
  DELETE_USERS: 'users:delete',
  
  // System permissions
  VIEW_SYSTEM: 'system:view',
  CONFIGURE_SYSTEM: 'system:configure',
  MANAGE_SECURITY: 'security:manage',
  VIEW_LOGS: 'logs:view'
} as const;

export type Permission = typeof Permission[keyof typeof Permission];

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;
  userId?: string;
  username?: string;
  ipAddress: string;
  userAgent?: string;
  resource: string;
  action: string;
  success: boolean;
  details: Record<string, any>;
  sessionId?: string;
}

export const SecurityEventType = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  DATA_ACCESS: 'data_access',
  CONFIGURATION_CHANGE: 'configuration_change',
  SECURITY_VIOLATION: 'security_violation',
  SESSION_MANAGEMENT: 'session_management'
} as const;

export type SecurityEventType = typeof SecurityEventType[keyof typeof SecurityEventType];

export const SecuritySeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type SecuritySeverity = typeof SecuritySeverity[keyof typeof SecuritySeverity];

export interface RateLimitInfo {
  windowStart: Date;
  requestCount: number;
  maxRequests: number;
  windowDuration: number;
  isLimited: boolean;
  resetTime: Date;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  username: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}