import { User, Role, Permission, RegisterRequest, ChangePasswordRequest } from '../types/auth-types.js';
import { PasswordManager } from '../security/password-manager.js';
import { SecurityLogger } from '../security/security-logger.js';
import { AuthConfig } from '../types/auth-types.js';

export class UserService {
  private users: Map<string, User> = new Map();
  private roles: Map<string, Role> = new Map();
  private passwordManager: PasswordManager;
  private securityLogger: SecurityLogger;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.passwordManager = new PasswordManager(
      config.passwordMinLength,
      config.passwordComplexity
    );
    this.securityLogger = new SecurityLogger();
    this.initializeDefaultRoles();
    this.createDefaultUsers();
  }

  private initializeDefaultRoles(): void {
    // Define default roles and permissions
    const adminPermissions: Permission[] = [
      { resource: '*', actions: ['*'] },
    ];

    const operatorPermissions: Permission[] = [
      { resource: 'dashboard', actions: ['read', 'write'] },
      { resource: 'equipment', actions: ['read', 'control'] },
      { resource: 'reports', actions: ['read', 'create'] },
    ];

    const viewerPermissions: Permission[] = [
      { resource: 'dashboard', actions: ['read'] },
      { resource: 'equipment', actions: ['read'] },
      { resource: 'reports', actions: ['read'] },
    ];

    this.roles.set('admin', {
      name: 'admin',
      permissions: adminPermissions,
      description: 'Full system access'
    });

    this.roles.set('operator', {
      name: 'operator',
      permissions: operatorPermissions,
      description: 'Factory floor operations'
    });

    this.roles.set('viewer', {
      name: 'viewer',
      permissions: viewerPermissions,
      description: 'Read-only access'
    });
  }

  private async createDefaultUsers(): Promise<void> {
    // Create default admin user
    const adminPassword = this.passwordManager.generateSecurePassword(16);
    const adminUser: User = {
      id: 'admin-001',
      username: 'admin',
      email: 'admin@factory-dashboard.local',
      passwordHash: await this.passwordManager.hashPassword(adminPassword),
      roles: ['admin'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedLoginAttempts: 0
    };

    this.users.set(adminUser.id, adminUser);
    console.log(`Default admin user created with password: ${adminPassword}`);
    console.log('⚠️  Please change this password immediately in production!');
  }

  async createUser(request: RegisterRequest, createdBy?: string): Promise<Omit<User, 'passwordHash'>> {
    // Validate username uniqueness
    const existingUser = Array.from(this.users.values()).find(u => u.username === request.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Validate email uniqueness
    const existingEmail = Array.from(this.users.values()).find(u => u.email === request.email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Validate password
    this.passwordManager.validatePassword(request.password);

    // Validate roles
    const roles = request.roles || ['viewer'];
    for (const role of roles) {
      if (!this.roles.has(role)) {
        throw new Error(`Invalid role: ${role}`);
      }
    }

    // Create user
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = await this.passwordManager.hashPassword(request.password);

    const user: User = {
      id: userId,
      username: request.username,
      email: request.email,
      passwordHash,
      roles,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedLoginAttempts: 0
    };

    this.users.set(userId, user);

    this.securityLogger.logSecurityEvent({
      eventType: 'USER_CREATED',
      userId: createdBy,
      ipAddress: '127.0.0.1', // This would come from request context
      userAgent: 'auth-service',
      severity: 'medium',
      details: {
        newUserId: userId,
        newUsername: request.username,
        roles: roles
      }
    });

    return this.sanitizeUser(user);
  }

  async authenticateUser(username: string, password: string, ipAddress: string, userAgent: string): Promise<User | null> {
    const user = Array.from(this.users.values()).find(u => u.username === username);
    
    if (!user) {
      this.securityLogger.logLoginAttempt(username, false, ipAddress, userAgent, { reason: 'User not found' });
      return null;
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.securityLogger.logLoginAttempt(username, false, ipAddress, userAgent, { 
        reason: 'Account locked',
        lockedUntil: user.lockedUntil.toISOString()
      });
      return null;
    }

    // Check if account is active
    if (!user.isActive) {
      this.securityLogger.logLoginAttempt(username, false, ipAddress, userAgent, { reason: 'Account inactive' });
      return null;
    }

    // Verify password
    const isValidPassword = await this.passwordManager.verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      // Increment failed attempts
      user.failedLoginAttempts++;
      user.updatedAt = new Date();

      // Lock account if too many failed attempts
      if (user.failedLoginAttempts >= this.config.maxFailedAttempts) {
        user.lockedUntil = new Date(Date.now() + this.config.lockoutDurationMinutes * 60 * 1000);
        
        this.securityLogger.logAccountLockout(
          user.id,
          user.username,
          ipAddress,
          userAgent,
          `Too many failed login attempts (${user.failedLoginAttempts})`
        );
      }

      this.securityLogger.logLoginAttempt(username, false, ipAddress, userAgent, { 
        reason: 'Invalid password',
        failedAttempts: user.failedLoginAttempts
      });
      
      return null;
    }

    // Successful login - reset failed attempts
    user.failedLoginAttempts = 0;
    user.lastLoginAt = new Date();
    user.updatedAt = new Date();
    user.lockedUntil = undefined;

    this.securityLogger.logLoginAttempt(username, true, ipAddress, userAgent);

    return user;
  }

  async changePassword(userId: string, request: ChangePasswordRequest, ipAddress: string, userAgent: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidCurrentPassword = await this.passwordManager.verifyPassword(request.currentPassword, user.passwordHash);
    if (!isValidCurrentPassword) {
      this.securityLogger.logPasswordChange(userId, user.username, ipAddress, userAgent, false);
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    this.passwordManager.validatePassword(request.newPassword);

    // Hash new password
    user.passwordHash = await this.passwordManager.hashPassword(request.newPassword);
    user.updatedAt = new Date();

    this.securityLogger.logPasswordChange(userId, user.username, ipAddress, userAgent, true);
  }

  getUserById(userId: string): Omit<User, 'passwordHash'> | null {
    const user = this.users.get(userId);
    return user ? this.sanitizeUser(user) : null;
  }

  getUserByUsername(username: string): User | null {
    return Array.from(this.users.values()).find(u => u.username === username) || null;
  }

  getAllUsers(): Omit<User, 'passwordHash'>[] {
    return Array.from(this.users.values()).map(user => this.sanitizeUser(user));
  }

  async updateUserRoles(userId: string, roles: string[], updatedBy: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate roles
    for (const role of roles) {
      if (!this.roles.has(role)) {
        throw new Error(`Invalid role: ${role}`);
      }
    }

    const oldRoles = [...user.roles];
    user.roles = roles;
    user.updatedAt = new Date();

    this.securityLogger.logSecurityEvent({
      eventType: 'USER_ROLES_UPDATED',
      userId: updatedBy,
      ipAddress: '127.0.0.1',
      userAgent: 'auth-service',
      severity: 'high',
      details: {
        targetUserId: userId,
        targetUsername: user.username,
        oldRoles,
        newRoles: roles
      }
    });
  }

  async deactivateUser(userId: string, deactivatedBy: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = false;
    user.updatedAt = new Date();

    this.securityLogger.logSecurityEvent({
      eventType: 'USER_DEACTIVATED',
      userId: deactivatedBy,
      ipAddress: '127.0.0.1',
      userAgent: 'auth-service',
      severity: 'high',
      details: {
        targetUserId: userId,
        targetUsername: user.username
      }
    });
  }

  getUserPermissions(userId: string): Permission[] {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      return [];
    }

    const permissions: Permission[] = [];
    
    for (const roleName of user.roles) {
      const role = this.roles.get(roleName);
      if (role) {
        permissions.push(...role.permissions);
      }
    }

    return permissions;
  }

  hasPermission(userId: string, resource: string, action: string): boolean {
    const permissions = this.getUserPermissions(userId);
    
    return permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      const actionMatch = permission.actions.includes('*') || permission.actions.includes(action);
      
      return resourceMatch && actionMatch;
    });
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Role management methods
  createRole(name: string, permissions: Permission[], description: string): void {
    if (this.roles.has(name)) {
      throw new Error('Role already exists');
    }

    this.roles.set(name, {
      name,
      permissions,
      description
    });
  }

  getRole(name: string): Role | null {
    return this.roles.get(name) || null;
  }

  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  updateRole(name: string, permissions: Permission[], description?: string): void {
    const role = this.roles.get(name);
    if (!role) {
      throw new Error('Role not found');
    }

    role.permissions = permissions;
    if (description !== undefined) {
      role.description = description;
    }
  }

  deleteRole(name: string): void {
    if (!this.roles.has(name)) {
      throw new Error('Role not found');
    }

    // Check if any users have this role
    const usersWithRole = Array.from(this.users.values()).filter(user => user.roles.includes(name));
    if (usersWithRole.length > 0) {
      throw new Error('Cannot delete role: users are assigned to this role');
    }

    this.roles.delete(name);
  }

  // Statistics and monitoring
  getUserStats(): {
    totalUsers: number;
    activeUsers: number;
    lockedUsers: number;
    usersByRole: { [role: string]: number };
  } {
    const users = Array.from(this.users.values());
    const usersByRole: { [role: string]: number } = {};

    // Initialize role counts
    for (const role of this.roles.keys()) {
      usersByRole[role] = 0;
    }

    // Count users by role
    for (const user of users) {
      for (const role of user.roles) {
        usersByRole[role] = (usersByRole[role] || 0) + 1;
      }
    }

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.isActive).length,
      lockedUsers: users.filter(u => u.lockedUntil && u.lockedUntil > new Date()).length,
      usersByRole
    };
  }
}