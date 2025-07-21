/**
 * User Management Service
 * Handles user registration, authentication, and profile management
 */

import type { 
  User, 
  UserContext, 
  LoginCredentials, 
  AuthResult, 
  UserRegistrationRequest,
  PasswordChangeRequest,
  Role
} from '../types/auth-types';
import { 
  AuthErrorCode,
  UserRole,
  Permission as UserPermission
} from '../types/auth-types';
import { jwtManager } from '../security/jwt-manager';
import { passwordManager } from '../security/password-manager';
import { securityLogger } from '../security/security-logger';

export interface UserStorage {
  users: Map<string, User>;
  usersByUsername: Map<string, string>; // username -> userId
  usersByEmail: Map<string, string>; // email -> userId
  sessions: Map<string, string>; // sessionId -> userId
  rateLimits: Map<string, { count: number; resetTime: Date }>;
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMinutes: number;
  lockoutMinutes: number;
}

export class UserService {
  private static instance: UserService;
  private storage: UserStorage;
  private rateLimitConfig: RateLimitConfig;
  private initialized: boolean = false;

  private constructor() {
    this.storage = {
      users: new Map(),
      usersByUsername: new Map(),
      usersByEmail: new Map(),
      sessions: new Map(),
      rateLimits: new Map()
    };

    this.rateLimitConfig = {
      maxAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10),
      windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10),
      lockoutMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10)
    };
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Initialize the user service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await jwtManager.initialize();
      await this.createDefaultUsers();
      this.initialized = true;
      console.log('✅ UserService initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize UserService:', error);
      throw error;
    }
  }

  /**
   * Register a new user
   */
  public async registerUser(
    request: UserRegistrationRequest,
    ipAddress: string
  ): Promise<AuthResult> {
    try {
      // Validate input
      const validation = this.validateRegistrationRequest(request);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
          errorCode: validation.errorCode
        };
      }

      // Check if username or email already exists
      if (this.storage.usersByUsername.has(request.username.toLowerCase())) {
        securityLogger.logAuthenticationEvent(false, {
          username: request.username,
          failureReason: 'Username already exists',
          ipAddress
        });

        return {
          success: false,
          error: 'Username already exists',
          errorCode: AuthErrorCode.USERNAME_TAKEN
        };
      }

      if (this.storage.usersByEmail.has(request.email.toLowerCase())) {
        securityLogger.logAuthenticationEvent(false, {
          username: request.username,
          failureReason: 'Email already exists',
          ipAddress
        });

        return {
          success: false,
          error: 'Email already exists',
          errorCode: AuthErrorCode.EMAIL_TAKEN
        };
      }

      // Hash password
      const passwordHash = await passwordManager.hashPassword(request.password);

      // Create user
      const user: User = {
        id: this.generateUserId(),
        username: request.username,
        email: request.email,
        passwordHash,
        roles: [this.getDefaultRole()],
        failedLoginAttempts: 0,
        accountLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      // Store user
      this.storage.users.set(user.id, user);
      this.storage.usersByUsername.set(user.username.toLowerCase(), user.id);
      this.storage.usersByEmail.set(user.email.toLowerCase(), user.id);

      // Log successful registration
      securityLogger.logAuthenticationEvent(true, {
        username: user.username,
        loginMethod: 'registration',
        ipAddress
      });

      // Create user context and generate tokens
      const userContext = this.createUserContext(user);
      const tokens = jwtManager.generateTokenPair(userContext);

      return {
        success: true,
        user: userContext,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      };

    } catch (error) {
      console.error('User registration failed:', error);
      return {
        success: false,
        error: 'Registration failed',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }
  }

  /**
   * Authenticate user login
   */
  public async authenticateUser(
    credentials: LoginCredentials,
    ipAddress: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit(ipAddress);
      if (!rateLimitCheck.allowed) {
        securityLogger.logAuthenticationEvent(false, {
          username: credentials.username,
          failureReason: 'Rate limited',
          ipAddress,
          userAgent
        });

        return {
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          errorCode: AuthErrorCode.RATE_LIMITED
        };
      }

      // Find user
      const userId = this.storage.usersByUsername.get(credentials.username.toLowerCase());
      if (!userId) {
        this.recordFailedAttempt(ipAddress);
        
        securityLogger.logAuthenticationEvent(false, {
          username: credentials.username,
          failureReason: 'User not found',
          ipAddress,
          userAgent
        });

        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS
        };
      }

      const user = this.storage.users.get(userId);
      if (!user) {
        this.recordFailedAttempt(ipAddress);
        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS
        };
      }

      // Check if account is locked
      if (user.accountLocked) {
        if (user.lockoutExpiry && user.lockoutExpiry > new Date()) {
          securityLogger.logAuthenticationEvent(false, {
            username: credentials.username,
            failureReason: 'Account locked',
            ipAddress,
            userAgent
          });

          return {
            success: false,
            error: 'Account is locked. Please try again later.',
            errorCode: AuthErrorCode.ACCOUNT_LOCKED
          };
        } else {
          // Unlock account if lockout period has expired
          user.accountLocked = false;
          user.lockoutExpiry = undefined;
          user.failedLoginAttempts = 0;
        }
      }

      // Check if account is active
      if (!user.isActive) {
        securityLogger.logAuthenticationEvent(false, {
          username: credentials.username,
          failureReason: 'Account disabled',
          ipAddress,
          userAgent
        });

        return {
          success: false,
          error: 'Account is disabled',
          errorCode: AuthErrorCode.ACCOUNT_DISABLED
        };
      }

      // Verify password
      const passwordValid = await passwordManager.verifyPassword(
        credentials.password,
        user.passwordHash
      );

      if (!passwordValid) {
        // Record failed attempt
        user.failedLoginAttempts++;
        this.recordFailedAttempt(ipAddress);

        // Lock account if too many failed attempts
        if (user.failedLoginAttempts >= this.rateLimitConfig.maxAttempts) {
          user.accountLocked = true;
          user.lockoutExpiry = new Date(
            Date.now() + this.rateLimitConfig.lockoutMinutes * 60 * 1000
          );
        }

        securityLogger.logAuthenticationEvent(false, {
          username: credentials.username,
          failureReason: 'Invalid password',
          ipAddress,
          userAgent
        });

        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS
        };
      }

      // Successful authentication
      user.failedLoginAttempts = 0;
      user.lastLogin = new Date();
      user.updatedAt = new Date();

      // Clear rate limiting for this IP
      this.storage.rateLimits.delete(ipAddress);

      // Create user context and generate tokens
      const userContext = this.createUserContext(user);
      const sessionId = jwtManager.generateSessionId();
      userContext.sessionId = sessionId;

      // Store session
      this.storage.sessions.set(sessionId, user.id);

      const tokens = jwtManager.generateTokenPair(userContext, {
        rememberMe: credentials.rememberMe
      });

      // Log successful authentication
      securityLogger.logAuthenticationEvent(true, {
        username: user.username,
        loginMethod: 'password',
        ipAddress,
        userAgent,
        sessionId
      });

      securityLogger.logSessionEvent('create', userContext, ipAddress);

      return {
        success: true,
        user: userContext,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      };

    } catch (error) {
      console.error('Authentication failed:', error);
      this.recordFailedAttempt(ipAddress);
      
      return {
        success: false,
        error: 'Authentication failed',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }
  }

  /**
   * Refresh authentication token
   */
  public async refreshToken(
    refreshToken: string
  ): Promise<AuthResult> {
    try {
      // Validate refresh token
      const validation = jwtManager.validateRefreshToken(refreshToken);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Invalid refresh token',
          errorCode: validation.errorCode
        };
      }

      // This is a simplified implementation
      // In production, you'd store refresh tokens and validate them against the database
      
      return {
        success: false,
        error: 'Token refresh not fully implemented',
        errorCode: AuthErrorCode.TOKEN_INVALID
      };

    } catch (error) {
      console.error('Token refresh failed:', error);
      return {
        success: false,
        error: 'Token refresh failed',
        errorCode: AuthErrorCode.TOKEN_INVALID
      };
    }
  }

  /**
   * Logout user
   */
  public async logoutUser(
    token: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userContext = jwtManager.extractUserContext(token);
      if (!userContext) {
        return { success: false, error: 'Invalid token' };
      }

      // Remove session
      this.storage.sessions.delete(userContext.sessionId);

      // Log logout event
      securityLogger.logSessionEvent('revoke', userContext, ipAddress);

      return { success: true };

    } catch (error) {
      console.error('Logout failed:', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  /**
   * Change user password
   */
  public async changePassword(
    userId: string,
    request: PasswordChangeRequest,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const user = this.storage.users.get(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const currentPasswordValid = await passwordManager.verifyPassword(
        request.currentPassword,
        user.passwordHash
      );

      if (!currentPasswordValid) {
        securityLogger.logConfigurationChangeEvent({
          userId,
          username: user.username,
          configType: 'password',
          changes: { password: { old: '[REDACTED]', new: '[REDACTED]' } },
          reason: 'Invalid current password'
        }, ipAddress);

        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const newPasswordHash = await passwordManager.hashPassword(request.newPassword);

      // Update user
      user.passwordHash = newPasswordHash;
      user.updatedAt = new Date();

      // Log password change
      securityLogger.logConfigurationChangeEvent({
        userId,
        username: user.username,
        configType: 'password',
        changes: { password: { old: '[REDACTED]', new: '[REDACTED]' } }
      }, ipAddress);

      return { success: true };

    } catch (error) {
      console.error('Password change failed:', error);
      return { success: false, error: 'Password change failed' };
    }
  }

  /**
   * Get user by ID
   */
  public getUserById(userId: string): User | undefined {
    return this.storage.users.get(userId);
  }

  /**
   * Get user by username
   */
  public getUserByUsername(username: string): User | undefined {
    const userId = this.storage.usersByUsername.get(username.toLowerCase());
    return userId ? this.storage.users.get(userId) : undefined;
  }

  /**
   * Validate user session
   */
  public validateSession(sessionId: string): User | undefined {
    const userId = this.storage.sessions.get(sessionId);
    return userId ? this.storage.users.get(userId) : undefined;
  }

  private validateRegistrationRequest(request: UserRegistrationRequest): {
    isValid: boolean;
    error?: string;
    errorCode?: AuthErrorCode;
  } {
    // Validate username
    if (!request.username || request.username.length < 3) {
      return {
        isValid: false,
        error: 'Username must be at least 3 characters long',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!request.email || !emailRegex.test(request.email)) {
      return {
        isValid: false,
        error: 'Invalid email address',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }

    // Validate password
    const passwordValidation = passwordManager.validatePassword(request.password);
    if (!passwordValidation.isValid) {
      return {
        isValid: false,
        error: passwordValidation.feedback.join(', '),
        errorCode: AuthErrorCode.PASSWORD_TOO_WEAK
      };
    }

    // Validate password confirmation
    if (request.password !== request.confirmPassword) {
      return {
        isValid: false,
        error: 'Passwords do not match',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };
    }

    return { isValid: true };
  }

  private checkRateLimit(ipAddress: string): { allowed: boolean; resetTime?: Date } {
    const now = new Date();
    const rateLimit = this.storage.rateLimits.get(ipAddress);

    if (!rateLimit) {
      return { allowed: true };
    }

    if (now > rateLimit.resetTime) {
      // Reset window has passed
      this.storage.rateLimits.delete(ipAddress);
      return { allowed: true };
    }

    if (rateLimit.count >= this.rateLimitConfig.maxAttempts) {
      return { allowed: false, resetTime: rateLimit.resetTime };
    }

    return { allowed: true };
  }

  private recordFailedAttempt(ipAddress: string): void {
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.rateLimitConfig.windowMinutes * 60 * 1000);
    
    const existing = this.storage.rateLimits.get(ipAddress);
    if (existing && now < existing.resetTime) {
      existing.count++;
    } else {
      this.storage.rateLimits.set(ipAddress, {
        count: 1,
        resetTime
      });
    }
  }

  private createUserContext(user: User): UserContext {
    const permissions = this.getUserPermissions(user.roles);
    
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles.map(role => role.name),
      permissions,
      lastLogin: user.lastLogin,
      sessionId: jwtManager.generateSessionId()
    };
  }

  private getUserPermissions(roles: unknown[]): string[] {
    // This would be more sophisticated in production
    const permissions: string[] = [];
    
    for (const role of roles as Role[]) {
      if ((role as Role).name === UserRole.ADMIN) {
        permissions.push(...Object.values(UserPermission));
      } else if ((role as Role).name === UserRole.OPERATOR) {
        permissions.push(
          UserPermission.VIEW_DASHBOARD,
          UserPermission.VIEW_EQUIPMENT,
          UserPermission.CONTROL_EQUIPMENT,
          UserPermission.VIEW_DATA,
          UserPermission.EXPORT_DATA
        );
      } else if ((role as Role).name === UserRole.VIEWER) {
        permissions.push(
          UserPermission.VIEW_DASHBOARD,
          UserPermission.VIEW_EQUIPMENT,
          UserPermission.VIEW_DATA
        );
      }
    }
    
    return [...new Set(permissions)]; // Remove duplicates
  }

  private getDefaultRole(): Role {
    return {
      id: 'role_viewer',
      name: UserRole.VIEWER,
      permissions: [],
      description: 'Default viewer role',
      isSystemRole: true,
      createdAt: new Date()
    };
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async createDefaultUsers(): Promise<void> {
    // Create default admin user if none exists
    if (this.storage.users.size === 0) {
      const adminPassword = passwordManager.generateSecurePassword(16);
      const adminPasswordHash = await passwordManager.hashPassword(adminPassword);

      const adminUser: User = {
        id: 'user_admin_default',
        username: 'admin',
        email: 'admin@factory-dashboard.local',
        passwordHash: adminPasswordHash,
        roles: [{
          id: 'role_admin',
          name: UserRole.ADMIN,
          permissions: [],
          description: 'System administrator',
          isSystemRole: true,
          createdAt: new Date()
        }],
        failedLoginAttempts: 0,
        accountLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      this.storage.users.set(adminUser.id, adminUser);
      this.storage.usersByUsername.set(adminUser.username.toLowerCase(), adminUser.id);
      this.storage.usersByEmail.set(adminUser.email.toLowerCase(), adminUser.id);

      if (process.env.NODE_ENV === 'development') {
        console.log('🔐 Default admin user created');
        console.log('   Username: admin');
        console.log('   ⚠️  Password has been securely stored. Use secure credential delivery!');
      }
    }
  }

  /**
   * Get service statistics
   */
  public getStatistics(): {
    totalUsers: number;
    activeUsers: number;
    lockedUsers: number;
    activeSessions: number;
    rateLimitedIPs: number;
  } {
    let activeUsers = 0;
    let lockedUsers = 0;

    for (const user of this.storage.users.values()) {
      if (user.isActive) activeUsers++;
      if (user.accountLocked) lockedUsers++;
    }

    return {
      totalUsers: this.storage.users.size,
      activeUsers,
      lockedUsers,
      activeSessions: this.storage.sessions.size,
      rateLimitedIPs: this.storage.rateLimits.size
    };
  }
}

// Export singleton instance
export const userService = UserService.getInstance();