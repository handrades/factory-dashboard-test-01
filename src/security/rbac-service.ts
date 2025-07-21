/**
 * Role-Based Access Control (RBAC) Service
 * Handles authorization, permissions, and access control
 */

import type { 
  UserContext
} from '../types/auth-types';
import { 
  UserRole,
  Permission as UserPermission,
  AuthErrorCode
} from '../types/auth-types';
import { securityLogger } from './security-logger';

export interface AccessControlResult {
  granted: boolean;
  reason?: string;
  requiredPermissions?: string[];
  userPermissions?: string[];
}

export interface ResourceAccessRule {
  resource: string;
  actions: string[];
  requiredPermissions: string[];
  conditions?: (context: UserContext, resourceId?: string) => boolean;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  inheritsFrom?: string[];
  isSystemRole: boolean;
  priority: number;
}

export class RBACService {
  private static instance: RBACService;
  private roleDefinitions: Map<string, RoleDefinition> = new Map();
  private accessRules: Map<string, ResourceAccessRule[]> = new Map();
  private permissionHierarchy: Map<string, string[]> = new Map();

  private constructor() {
    this.initializeDefaultRoles();
    this.initializeAccessRules();
    this.initializePermissionHierarchy();
  }

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  /**
   * Check if user has permission to perform action on resource
   */
  public hasPermission(
    userContext: UserContext,
    resource: string,
    action: string,
    resourceId?: string
  ): AccessControlResult {
    try {
      // Get access rules for resource
      const rules = this.accessRules.get(resource) || [];
      const applicableRule = rules.find(rule => 
        rule.actions.includes(action) || rule.actions.includes('*')
      );

      if (!applicableRule) {
        // No specific rule found, check if user has general permission
        const generalPermission = `${resource}:${action}`;
        const hasGeneralPermission = this.userHasPermission(userContext, generalPermission);
        
        const result: AccessControlResult = {
          granted: hasGeneralPermission,
          reason: hasGeneralPermission ? undefined : `No permission for ${resource}:${action}`,
          requiredPermissions: [generalPermission],
          userPermissions: userContext.permissions
        };

        this.logAuthorizationEvent(userContext, resource, action, generalPermission, result.granted);
        return result;
      }

      // Check required permissions
      const hasRequiredPermissions = applicableRule.requiredPermissions.every(permission =>
        this.userHasPermission(userContext, permission)
      );

      if (!hasRequiredPermissions) {
        const result: AccessControlResult = {
          granted: false,
          reason: 'Insufficient permissions',
          requiredPermissions: applicableRule.requiredPermissions,
          userPermissions: userContext.permissions
        };

        this.logAuthorizationEvent(userContext, resource, action, applicableRule.requiredPermissions.join(', '), false);
        return result;
      }

      // Check additional conditions if present
      if (applicableRule.conditions) {
        const conditionMet = applicableRule.conditions(userContext, resourceId);
        if (!conditionMet) {
          const result: AccessControlResult = {
            granted: false,
            reason: 'Access conditions not met',
            requiredPermissions: applicableRule.requiredPermissions,
            userPermissions: userContext.permissions
          };

          this.logAuthorizationEvent(userContext, resource, action, 'conditions', false);
          return result;
        }
      }

      // Access granted
      const result: AccessControlResult = {
        granted: true,
        requiredPermissions: applicableRule.requiredPermissions,
        userPermissions: userContext.permissions
      };

      this.logAuthorizationEvent(userContext, resource, action, applicableRule.requiredPermissions.join(', '), true);
      return result;

    } catch (error) {
      console.error('Permission check failed:', error);
      
      const result: AccessControlResult = {
        granted: false,
        reason: 'Permission check failed',
        userPermissions: userContext.permissions
      };

      this.logAuthorizationEvent(userContext, resource, action, 'error', false);
      return result;
    }
  }

  /**
   * Check if user has specific permission
   */
  public userHasPermission(userContext: UserContext, permission: string): boolean {
    // Direct permission check
    if (userContext.permissions.includes(permission)) {
      return true;
    }

    // Check permission hierarchy (implied permissions)
    const impliedPermissions = this.permissionHierarchy.get(permission) || [];
    return impliedPermissions.some(impliedPermission => 
      userContext.permissions.includes(impliedPermission)
    );
  }

  /**
   * Check if user has any of the specified roles
   */
  public userHasRole(userContext: UserContext, roles: string[]): boolean {
    return roles.some(role => userContext.roles.includes(role));
  }

  /**
   * Check if user has all of the specified roles
   */
  public userHasAllRoles(userContext: UserContext, roles: string[]): boolean {
    return roles.every(role => userContext.roles.includes(role));
  }

  /**
   * Get effective permissions for user (including inherited)
   */
  public getEffectivePermissions(userContext: UserContext): string[] {
    const effectivePermissions = new Set<string>();

    // Add direct permissions
    userContext.permissions.forEach(permission => {
      effectivePermissions.add(permission);
    });

    // Add role-based permissions
    userContext.roles.forEach(roleName => {
      const roleDefinition = this.getRoleByName(roleName);
      if (roleDefinition) {
        roleDefinition.permissions.forEach(permission => {
          effectivePermissions.add(permission);
        });

        // Add inherited permissions
        this.getInheritedPermissions(roleDefinition).forEach(permission => {
          effectivePermissions.add(permission);
        });
      }
    });

    return Array.from(effectivePermissions);
  }

  /**
   * Create middleware function for Express.js route protection
   */
  public createAuthorizationMiddleware(
    resource: string,
    action: string,
    options: {
      requireAll?: boolean;
      customCheck?: (userContext: UserContext) => boolean;
    } = {}
  ) {
    return (req: { userContext?: UserContext; [key: string]: unknown }, res: { status?: (code: number) => { json: (data: unknown) => void } }, next: (() => void) | undefined) => {
      const userContext = req.userContext as UserContext;

      if (!userContext) {
        if (res.status) {
          return res.status(401).json({
            error: 'Authentication required',
            code: AuthErrorCode.TOKEN_INVALID
          });
        }
        return;
      }

      // Custom check if provided
      if (options.customCheck && !options.customCheck(userContext)) {
        if (res.status) {
          return res.status(403).json({
            error: 'Access denied',
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS
          });
        }
        return;
      }

      // Permission check
      const accessResult = this.hasPermission(userContext, resource, action, undefined);
      
      if (!accessResult.granted) {
        if (res.status) {
          return res.status(403).json({
            error: accessResult.reason || 'Insufficient permissions',
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            requiredPermissions: accessResult.requiredPermissions
          });
        }
        return;
      }

      if (next) next();
    };
  }

  /**
   * Add or update role definition
   */
  public defineRole(roleDefinition: RoleDefinition): void {
    this.roleDefinitions.set(roleDefinition.name, roleDefinition);
    console.log(`🔐 Role defined: ${roleDefinition.name}`);
  }

  /**
   * Add access rule for resource
   */
  public addAccessRule(rule: ResourceAccessRule): void {
    const existingRules = this.accessRules.get(rule.resource) || [];
    existingRules.push(rule);
    this.accessRules.set(rule.resource, existingRules);
    console.log(`🔒 Access rule added for resource: ${rule.resource}`);
  }

  /**
   * Get role definition by name
   */
  public getRoleByName(roleName: string): RoleDefinition | undefined {
    return this.roleDefinitions.get(roleName);
  }

  /**
   * Get all available roles
   */
  public getAllRoles(): RoleDefinition[] {
    return Array.from(this.roleDefinitions.values());
  }

  /**
   * Get permissions for role (including inherited)
   */
  public getRolePermissions(roleName: string): string[] {
    const role = this.roleDefinitions.get(roleName);
    if (!role) return [];

    const permissions = new Set<string>(role.permissions);
    
    // Add inherited permissions
    this.getInheritedPermissions(role).forEach(permission => {
      permissions.add(permission);
    });

    return Array.from(permissions);
  }

  /**
   * Check if role exists
   */
  public roleExists(roleName: string): boolean {
    return this.roleDefinitions.has(roleName);
  }

  /**
   * Validate user context has minimum required role
   */
  public validateMinimumRole(userContext: UserContext, minimumRole: UserRole): boolean {
    const roleHierarchy = {
      [UserRole.VIEWER]: 0,
      [UserRole.OPERATOR]: 1,
      [UserRole.MAINTENANCE]: 2,
      [UserRole.ADMIN]: 3
    };

    const userMaxRole = Math.max(
      ...userContext.roles.map(role => roleHierarchy[role as UserRole] || 0)
    );

    return userMaxRole >= roleHierarchy[minimumRole];
  }

  private initializeDefaultRoles(): void {
    // Admin role - full access
    this.defineRole({
      id: 'role_admin',
      name: UserRole.ADMIN,
      description: 'System administrator with full access',
      permissions: Object.values(UserPermission),
      isSystemRole: true,
      priority: 100
    });

    // Operator role - operational access
    this.defineRole({
      id: 'role_operator',
      name: UserRole.OPERATOR,
      description: 'Factory operator with control access',
      permissions: [
        UserPermission.VIEW_DASHBOARD,
        UserPermission.VIEW_EQUIPMENT,
        UserPermission.CONTROL_EQUIPMENT,
        UserPermission.VIEW_DATA,
        UserPermission.EXPORT_DATA,
        UserPermission.VIEW_SYSTEM
      ],
      isSystemRole: true,
      priority: 50
    });

    // Maintenance role - maintenance access
    this.defineRole({
      id: 'role_maintenance',
      name: UserRole.MAINTENANCE,
      description: 'Maintenance personnel with configuration access',
      permissions: [
        UserPermission.VIEW_DASHBOARD,
        UserPermission.VIEW_EQUIPMENT,
        UserPermission.CONFIGURE_EQUIPMENT,
        UserPermission.VIEW_DATA,
        UserPermission.EXPORT_DATA,
        UserPermission.VIEW_SYSTEM,
        UserPermission.VIEW_LOGS
      ],
      isSystemRole: true,
      priority: 40
    });

    // Viewer role - read-only access
    this.defineRole({
      id: 'role_viewer',
      name: UserRole.VIEWER,
      description: 'Read-only access to dashboard and data',
      permissions: [
        UserPermission.VIEW_DASHBOARD,
        UserPermission.VIEW_EQUIPMENT,
        UserPermission.VIEW_DATA
      ],
      isSystemRole: true,
      priority: 10
    });
  }

  private initializeAccessRules(): void {
    // Dashboard access rules
    this.addAccessRule({
      resource: 'dashboard',
      actions: ['view'],
      requiredPermissions: [UserPermission.VIEW_DASHBOARD]
    });

    this.addAccessRule({
      resource: 'dashboard',
      actions: ['manage', 'configure'],
      requiredPermissions: [UserPermission.MANAGE_DASHBOARD]
    });

    // Equipment access rules
    this.addAccessRule({
      resource: 'equipment',
      actions: ['view'],
      requiredPermissions: [UserPermission.VIEW_EQUIPMENT]
    });

    this.addAccessRule({
      resource: 'equipment',
      actions: ['control', 'start', 'stop'],
      requiredPermissions: [UserPermission.CONTROL_EQUIPMENT]
    });

    this.addAccessRule({
      resource: 'equipment',
      actions: ['configure', 'update'],
      requiredPermissions: [UserPermission.CONFIGURE_EQUIPMENT]
    });

    // Data access rules
    this.addAccessRule({
      resource: 'data',
      actions: ['view', 'read'],
      requiredPermissions: [UserPermission.VIEW_DATA]
    });

    this.addAccessRule({
      resource: 'data',
      actions: ['export', 'download'],
      requiredPermissions: [UserPermission.EXPORT_DATA]
    });

    this.addAccessRule({
      resource: 'data',
      actions: ['delete'],
      requiredPermissions: [UserPermission.DELETE_DATA]
    });

    // User management rules
    this.addAccessRule({
      resource: 'users',
      actions: ['view', 'list'],
      requiredPermissions: [UserPermission.VIEW_USERS]
    });

    this.addAccessRule({
      resource: 'users',
      actions: ['create', 'update', 'manage'],
      requiredPermissions: [UserPermission.MANAGE_USERS]
    });

    this.addAccessRule({
      resource: 'users',
      actions: ['delete'],
      requiredPermissions: [UserPermission.DELETE_USERS]
    });

    // System access rules
    this.addAccessRule({
      resource: 'system',
      actions: ['view', 'status'],
      requiredPermissions: [UserPermission.VIEW_SYSTEM]
    });

    this.addAccessRule({
      resource: 'system',
      actions: ['configure', 'update'],
      requiredPermissions: [UserPermission.CONFIGURE_SYSTEM]
    });

    this.addAccessRule({
      resource: 'security',
      actions: ['*'],
      requiredPermissions: [UserPermission.MANAGE_SECURITY]
    });

    this.addAccessRule({
      resource: 'logs',
      actions: ['view', 'read'],
      requiredPermissions: [UserPermission.VIEW_LOGS]
    });

    // Self-service rules (users can manage their own profile)
    this.addAccessRule({
      resource: 'profile',
      actions: ['view', 'update'],
      requiredPermissions: [UserPermission.VIEW_DASHBOARD], // Basic permission
      conditions: (userContext: UserContext, resourceId?: string) => {
        // Users can only access their own profile
        return !resourceId || resourceId === userContext.id;
      }
    });
  }

  private initializePermissionHierarchy(): void {
    // Higher-level permissions imply lower-level ones
    this.permissionHierarchy.set(UserPermission.MANAGE_DASHBOARD, [UserPermission.VIEW_DASHBOARD]);
    this.permissionHierarchy.set(UserPermission.CONTROL_EQUIPMENT, [UserPermission.VIEW_EQUIPMENT]);
    this.permissionHierarchy.set(UserPermission.CONFIGURE_EQUIPMENT, [UserPermission.VIEW_EQUIPMENT, UserPermission.CONTROL_EQUIPMENT]);
    this.permissionHierarchy.set(UserPermission.EXPORT_DATA, [UserPermission.VIEW_DATA]);
    this.permissionHierarchy.set(UserPermission.DELETE_DATA, [UserPermission.VIEW_DATA]);
    this.permissionHierarchy.set(UserPermission.MANAGE_USERS, [UserPermission.VIEW_USERS]);
    this.permissionHierarchy.set(UserPermission.DELETE_USERS, [UserPermission.VIEW_USERS, UserPermission.MANAGE_USERS]);
    this.permissionHierarchy.set(UserPermission.CONFIGURE_SYSTEM, [UserPermission.VIEW_SYSTEM]);
  }

  private getInheritedPermissions(role: RoleDefinition): string[] {
    const inheritedPermissions = new Set<string>();

    if (role.inheritsFrom) {
      for (const parentRoleName of role.inheritsFrom) {
        const parentRole = this.roleDefinitions.get(parentRoleName);
        if (parentRole) {
          parentRole.permissions.forEach(permission => {
            inheritedPermissions.add(permission);
          });
          
          // Recursively get inherited permissions
          this.getInheritedPermissions(parentRole).forEach(permission => {
            inheritedPermissions.add(permission);
          });
        }
      }
    }

    return Array.from(inheritedPermissions);
  }

  private logAuthorizationEvent(
    userContext: UserContext,
    resource: string,
    action: string,
    permission: string,
    granted: boolean
  ): void {
    securityLogger.logAuthorizationEvent({
      userId: userContext.id,
      username: userContext.username,
      resource,
      action,
      permission,
      granted,
      reason: granted ? undefined : 'Insufficient permissions'
    });
  }

  /**
   * Get service statistics
   */
  public getStatistics(): {
    totalRoles: number;
    systemRoles: number;
    customRoles: number;
    totalAccessRules: number;
    permissionHierarchyRules: number;
  } {
    const roles = Array.from(this.roleDefinitions.values());
    const systemRoles = roles.filter(role => role.isSystemRole).length;
    const customRoles = roles.length - systemRoles;
    
    const totalAccessRules = Array.from(this.accessRules.values())
      .reduce((total, rules) => total + rules.length, 0);

    return {
      totalRoles: roles.length,
      systemRoles,
      customRoles,
      totalAccessRules,
      permissionHierarchyRules: this.permissionHierarchy.size
    };
  }
}

// Export singleton instance
export const rbacService = RBACService.getInstance();