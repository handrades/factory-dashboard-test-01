/**
 * User Menu Component
 * Displays user information and authentication controls
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './UserMenu.css';

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className = '' }: UserMenuProps) {
  const { user, logout, isTokenExpired } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
      setIsOpen(false);
    }
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const getRoleDisplayName = (role: string): string => {
    const roleNames: Record<string, string> = {
      admin: 'Administrator',
      operator: 'Operator',
      maintenance: 'Maintenance',
      viewer: 'Viewer'
    };
    return roleNames[role] || role;
  };

  const getRoleBadgeClass = (role: string): string => {
    const roleClasses: Record<string, string> = {
      admin: 'role-badge-admin',
      operator: 'role-badge-operator',
      maintenance: 'role-badge-maintenance',
      viewer: 'role-badge-viewer'
    };
    return roleClasses[role] || 'role-badge-default';
  };

  const getInitials = (username: string): string => {
    return username
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  };

  if (!user) {
    return null;
  }

  const isExpired = isTokenExpired();
  const primaryRole = user.roles[0] || 'viewer';

  return (
    <div className={`user-menu ${className}`} ref={menuRef}>
      <button
        className={`user-menu-trigger ${isOpen ? 'active' : ''} ${isExpired ? 'expired' : ''}`}
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <div className="user-avatar">
          {getInitials(user.username)}
        </div>
        <div className="user-info">
          <span className="user-name">{user.username}</span>
          <span className={`user-role ${getRoleBadgeClass(primaryRole)}`}>
            {getRoleDisplayName(primaryRole)}
          </span>
        </div>
        <div className="menu-arrow">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="currentColor">
            <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-avatar-large">
              {getInitials(user.username)}
            </div>
            <div className="user-details">
              <div className="user-name-large">{user.username}</div>
              <div className="user-email">{user.email}</div>
              <div className="user-roles">
                {user.roles.map(role => (
                  <span key={role} className={`role-badge ${getRoleBadgeClass(role)}`}>
                    {getRoleDisplayName(role)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <div className="user-menu-section">
            <div className="session-info">
              <div className="session-item">
                <span className="session-label">Session ID:</span>
                <span className="session-value">{user.sessionId.substring(0, 8)}...</span>
              </div>
              {user.lastLogin && (
                <div className="session-item">
                  <span className="session-label">Last Login:</span>
                  <span className="session-value">
                    {new Date(user.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="session-item">
                <span className="session-label">Status:</span>
                <span className={`session-status ${isExpired ? 'expired' : 'active'}`}>
                  {isExpired ? 'Expired' : 'Active'}
                </span>
              </div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <div className="user-menu-actions">
            <button
              className="menu-action-button profile-button"
              onClick={() => {
                setIsOpen(false);
                // Navigate to profile page
                console.log('Navigate to profile');
              }}
            >
              <span className="action-icon">👤</span>
              <span>Profile Settings</span>
            </button>

            <button
              className="menu-action-button preferences-button"
              onClick={() => {
                setIsOpen(false);
                // Navigate to preferences
                console.log('Navigate to preferences');
              }}
            >
              <span className="action-icon">⚙️</span>
              <span>Preferences</span>
            </button>

            <button
              className="menu-action-button logout-button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <span className="action-icon">
                {isLoggingOut ? (
                  <span className="loading-spinner-small"></span>
                ) : (
                  '🚪'
                )}
              </span>
              <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
            </button>
          </div>

          {isExpired && (
            <div className="session-warning">
              <span className="warning-icon">⚠️</span>
              <span>Your session has expired. Please sign in again.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}