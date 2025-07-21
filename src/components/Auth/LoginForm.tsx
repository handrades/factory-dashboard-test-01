/**
 * Login Form Component
 * Provides user authentication interface
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { LoginCredentials } from '../../types/auth-types';
import { AuthErrorCode } from '../../types/auth-types';
import './LoginForm.css';

interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function LoginForm({ onSuccess, redirectTo }: LoginFormProps) {
  const { login, loading, error, clearError } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Clear errors when component mounts or credentials change
  useEffect(() => {
    clearError();
    setValidationErrors({});
  }, [credentials.username, credentials.password, clearError]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!credentials.username.trim()) {
      errors.username = 'Username is required';
    } else if (credentials.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (!credentials.password) {
      errors.password = 'Password is required';
    } else if (credentials.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await login(credentials);
      
      // If we reach here without error, login was successful
      console.log('Login successful');
      onSuccess?.();
      
      // Redirect if specified
      if (redirectTo) {
        window.location.href = redirectTo;
      }
      // Error handling is managed by the AuthContext
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleInputChange = (field: keyof LoginCredentials, value: string | boolean) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getErrorMessage = (errorCode?: AuthErrorCode): string => {
    switch (errorCode) {
      case AuthErrorCode.INVALID_CREDENTIALS:
        return 'Invalid username or password. Please try again.';
      case AuthErrorCode.ACCOUNT_LOCKED:
        return 'Your account has been locked due to too many failed attempts. Please try again later.';
      case AuthErrorCode.ACCOUNT_DISABLED:
        return 'Your account has been disabled. Please contact an administrator.';
      case AuthErrorCode.RATE_LIMITED:
        return 'Too many login attempts. Please wait before trying again.';
      default:
        return error || 'An error occurred during login. Please try again.';
    }
  };

  return (
    <div className="login-form-container">
      <div className="login-form">
        <div className="login-header">
          <h1>Factory Dashboard</h1>
          <p>Sign in to access the monitoring system</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={credentials.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className={validationErrors.username ? 'error' : ''}
              placeholder="Enter your username"
              autoComplete="username"
              disabled={loading}
              required
            />
            {validationErrors.username && (
              <span className="error-message">{validationErrors.username}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={validationErrors.password ? 'error' : ''}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {validationErrors.password && (
              <span className="error-message">{validationErrors.password}</span>
            )}
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={credentials.rememberMe}
                onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
                disabled={loading}
              />
              <span className="checkbox-text">Remember me for 30 days</span>
            </label>
          </div>

          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{getErrorMessage()}</span>
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="demo-credentials">
            <h3>Demo Credentials</h3>
            <div className="demo-accounts">
              <div className="demo-account">
                <strong>Administrator:</strong>
                <br />
                Username: <code>admin</code>
                <br />
                Password: <code>admin123</code>
              </div>
              <div className="demo-account">
                <strong>Operator:</strong>
                <br />
                Username: <code>operator</code>
                <br />
                Password: <code>operator123</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}