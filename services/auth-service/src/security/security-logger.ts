import { SecurityEvent } from '../types/auth-types.js';

export class SecurityLogger {
  private events: SecurityEvent[] = [];
  private maxEventsInMemory: number = 1000;

  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };

    // Add to in-memory storage
    this.events.unshift(securityEvent);
    
    // Keep only the most recent events in memory
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(0, this.maxEventsInMemory);
    }

    // Log to console with appropriate level
    this.logToConsole(securityEvent);

    // In a production environment, you would also:
    // - Send to external logging service (e.g., ELK stack, Splunk)
    // - Store in database for persistence
    // - Send alerts for critical events
    // - Integrate with SIEM systems
  }

  logLoginAttempt(username: string, success: boolean, ipAddress: string, userAgent: string, details?: Record<string, unknown>): void {
    this.logSecurityEvent({
      eventType: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      username,
      ipAddress,
      userAgent,
      severity: success ? 'low' : 'medium',
      details: {
        success,
        ...details
      }
    });
  }

  logPasswordChange(userId: string, username: string, ipAddress: string, userAgent: string, success: boolean): void {
    this.logSecurityEvent({
      eventType: 'PASSWORD_CHANGE',
      userId,
      username,
      ipAddress,
      userAgent,
      severity: 'medium',
      details: {
        success
      }
    });
  }

  logAccountLockout(userId: string, username: string, ipAddress: string, userAgent: string, reason: string): void {
    this.logSecurityEvent({
      eventType: 'ACCOUNT_LOCKOUT',
      userId,
      username,
      ipAddress,
      userAgent,
      severity: 'high',
      details: {
        reason,
        automaticLockout: true
      }
    });
  }

  logUnauthorizedAccess(resource: string, ipAddress: string, userAgent: string, userId?: string, username?: string): void {
    this.logSecurityEvent({
      eventType: 'UNAUTHORIZED_ACCESS',
      userId,
      username,
      ipAddress,
      userAgent,
      severity: 'high',
      details: {
        resource,
        attemptedAction: 'ACCESS'
      }
    });
  }

  logTokenRefresh(userId: string, username: string, ipAddress: string, userAgent: string, success: boolean): void {
    this.logSecurityEvent({
      eventType: 'TOKEN_REFRESH',
      userId,
      username,
      ipAddress,
      userAgent,
      severity: 'low',
      details: {
        success
      }
    });
  }

  logSuspiciousActivity(description: string, ipAddress: string, userAgent: string, userId?: string, username?: string, details?: Record<string, unknown>): void {
    this.logSecurityEvent({
      eventType: 'SUSPICIOUS_ACTIVITY',
      userId,
      username,
      ipAddress,
      userAgent,
      severity: 'critical',
      details: {
        description,
        ...details
      }
    });
  }

  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.events.slice(0, limit);
  }

  getEventsByUser(userId: string, limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(event => event.userId === userId)
      .slice(0, limit);
  }

  getEventsByType(eventType: string, limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(event => event.eventType === eventType)
      .slice(0, limit);
  }

  getEventsBySeverity(severity: SecurityEvent['severity'], limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(event => event.severity === severity)
      .slice(0, limit);
  }

  getEventsInTimeRange(startTime: Date, endTime: Date): SecurityEvent[] {
    return this.events.filter(event => 
      event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  private logToConsole(event: SecurityEvent): void {
    const logData = {
      timestamp: event.timestamp.toISOString(),
      eventType: event.eventType,
      severity: event.severity,
      user: event.username || event.userId || 'anonymous',
      ipAddress: this.maskIpAddress(event.ipAddress),
      details: this.sanitizeDetails(event.details)
    };

    switch (event.severity) {
      case 'critical':
        console.error('🚨 SECURITY CRITICAL:', JSON.stringify(logData, null, 2));
        break;
      case 'high':
        console.error('⚠️  SECURITY HIGH:', JSON.stringify(logData, null, 2));
        break;
      case 'medium':
        console.warn('📋 SECURITY MEDIUM:', JSON.stringify(logData, null, 2));
        break;
      case 'low':
        console.info('ℹ️  SECURITY INFO:', JSON.stringify(logData, null, 2));
        break;
    }
  }

  private maskIpAddress(ip: string): string {
    // Mask the last octet of IPv4 addresses for privacy
    const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}$/;
    const match = ip.match(ipv4Regex);
    
    if (match) {
      return `${match[1]}***`;
    }
    
    // For IPv6 or other formats, mask the last part
    const parts = ip.split(':');
    if (parts.length > 1) {
      parts[parts.length - 1] = '***';
      return parts.join(':');
    }
    
    return ip;
  }

  private sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...details };
    
    // Remove sensitive information from logs
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'hash'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  // Method to export events for external analysis
  exportEvents(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      return this.exportAsCsv();
    }
    
    return JSON.stringify(this.events, null, 2);
  }

  private exportAsCsv(): string {
    if (this.events.length === 0) return '';
    
    const headers = ['timestamp', 'eventType', 'severity', 'userId', 'username', 'ipAddress', 'userAgent', 'details'];
    const csvRows = [headers.join(',')];
    
    this.events.forEach(event => {
      const row = [
        event.timestamp.toISOString(),
        event.eventType,
        event.severity,
        event.userId || '',
        event.username || '',
        this.maskIpAddress(event.ipAddress),
        `"${event.userAgent}"`,
        `"${JSON.stringify(this.sanitizeDetails(event.details))}"`
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  // Clear old events (for memory management)
  clearOldEvents(olderThan: Date): number {
    const initialLength = this.events.length;
    this.events = this.events.filter(event => event.timestamp > olderThan);
    return initialLength - this.events.length;
  }
}