/**
 * Protected Route Component
 * Handles route protection based on authentication and authorization
 */

import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LoginForm } from './LoginForm';
import { UserRole } from '../../types/auth-types';
import './ProtectedRoute.css';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAll?: boolean; // If true, user must have ALL permissions/roles, otherwise ANY
  fallback?: ReactNode;
  showLoginForm?: boolean;
}

export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAll = false,
  fallback,
  showLoginForm = true
}: ProtectedRouteProps) {
  const { isAuthenticated, user, loading, hasPermission, hasRole, hasAnyRole } = useAuth();

  // Show loading spinner while authentication state is being determined
  if (loading) {
    return (
      <div className="protected-route-loading">
        <div className="loading-spinner-large"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    if (showLoginForm) {
      return <LoginForm />;
    }
    return fallback || (
      <div className="protected-route-error">
        <h2>Authentication Required</h2>
        <p>You must be logged in to access this page.</p>
      </div>
    );
  }

  // Check permissions if specified
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAll
      ? requiredPermissions.every(permission => hasPermission(permission))
      : requiredPermissions.some(permission => hasPermission(permission));

    if (!hasRequiredPermissions) {
      return fallback || (
        <div className="protected-route-error">
          <h2>Access Denied</h2>
          <p>You don't have the required permissions to access this page.</p>
          <div className="permission-details">
            <h3>Required Permissions:</h3>
            <ul>
              {requiredPermissions.map(permission => (
                <li key={permission} className={hasPermission(permission) ? 'has-permission' : 'missing-permission'}>
                  {permission} {hasPermission(permission) ? '✅' : '❌'}
                </li>
              ))}
            </ul>
            <h3>Your Permissions:</h3>
            <ul>
              {user?.permissions.map(permission => (
                <li key={permission} className="user-permission">
                  {permission}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
  }

  // Check roles if specified
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAll
      ? requiredRoles.every(role => hasRole(role))
      : hasAnyRole(requiredRoles);

    if (!hasRequiredRoles) {
      return fallback || (
        <div className="protected-route-error">
          <h2>Access Denied</h2>
          <p>You don't have the required role to access this page.</p>
          <div className="role-details">
            <h3>Required Roles:</h3>
            <ul>
              {requiredRoles.map(role => (
                <li key={role} className={hasRole(role) ? 'has-role' : 'missing-role'}>
                  {role} {hasRole(role) ? '✅' : '❌'}
                </li>
              ))}
            </ul>
            <h3>Your Roles:</h3>
            <ul>
              {user?.roles.map(role => (
                <li key={role} className="user-role">
                  {role}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
  }

  // All checks passed, render the protected content
  return <>{children}</>;
}

// Convenience components for common protection scenarios
export function AdminRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedRoute
      requiredRoles={[UserRole.ADMIN]}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

export function OperatorRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedRoute
      requiredRoles={[UserRole.ADMIN, UserRole.OPERATOR]}
      requireAll={false}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

export function MaintenanceRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedRoute
      requiredRoles={[UserRole.ADMIN, UserRole.MAINTENANCE]}
      requireAll={false}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

export function ViewerRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedRoute
      requiredRoles={[UserRole.ADMIN, UserRole.OPERATOR, UserRole.MAINTENANCE, UserRole.VIEWER]}
      requireAll={false}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}