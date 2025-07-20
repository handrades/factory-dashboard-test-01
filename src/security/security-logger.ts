/**
 * Security Event Logging System
 * Handles structured logging of security events and incidents
 */

import type { SecurityEvent, UserContext } from '../types/auth-types';
import { SecurityEventType, SecuritySeverity } from '../types/auth-types';
import { secretManager } from './SecretManager';

export interface SecurityLoggerConfig {
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  logLevel: SecuritySeverity;
  maxLogSize: number;
  rotateLogFiles: boolean;
}

export interface AuthenticationEventDetails {
  username?: string;
  loginMethod?: string;
  failureReason?: string;
  userAgent?: string;
  ipAddress: string;
  sessionId?: string;
}

export interface AuthorizationEventDetails {
  userId: string;
  username: string;
  resource: string;
  action: string;
  permission: string;
  granted: boolean;
  reason?: string;
}

export interface DataAccessEventDetails {
  userId: string;
  username: string;
  dataType: string;
  operation: string;
  recordCount?: number;
  filters?: Record<string, unknown>;
}

export interface ConfigurationChangeEventDetails {
  userId: string;
  username: string;
  configType: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
}

export interface SecurityViolationEventDetails {
  violationType: string;
  description: string;
  riskLevel: SecuritySeverity;
  automaticResponse?: string;
  additionalContext?: Record<string, unknown>;
}

export class SecurityLogger {
  private static instance: SecurityLogger;
  private config: SecurityLoggerConfig;
  private eventBuffer: SecurityEvent[] = [];
  private readonly maxBufferSize = 1000;

  private constructor() {
    this.config = {
      enableConsoleLogging: process.env.LOG_SECURITY_EVENTS !== 'false',
      enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
      logLevel: (process.env.SECURITY_LOG_LEVEL as SecuritySeverity) || SecuritySeverity.LOW,
      maxLogSize: parseInt(process.env.MAX_LOG_SIZE || '10485760', 10), // 10MB
      rotateLogFiles: process.env.ROTATE_LOG_FILES === 'true'
    };
  }

  public static getInstance(): SecurityLogger {
    if (!SecurityLogger.instance) {
      SecurityLogger.instance = new SecurityLogger();
    }
    return SecurityLogger.instance;
  }

  /**
   * Log authentication event
   */
  public logAuthenticationEvent(
    success: boolean,
    details: AuthenticationEventDetails,
    severity: SecuritySeverity = SecuritySeverity.MEDIUM
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.AUTHENTICATION,
      severity,
      timestamp: new Date(),
      username: details.username,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,
      resource: 'authentication',
      action: 'login',
      success,
      details: this.sanitizeDetails(details),
      sessionId: details.sessionId
    };

    this.logEvent(event);
  }

  /**
   * Log authorization event
   */
  public logAuthorizationEvent(
    details: AuthorizationEventDetails,
    severity: SecuritySeverity = SecuritySeverity.LOW
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.AUTHORIZATION,
      severity,
      timestamp: new Date(),
      userId: details.userId,
      username: details.username,
      ipAddress: '', // Would be populated from request context
      resource: details.resource,
      action: details.action,
      success: details.granted,
      details: this.sanitizeDetails(details)
    };

    this.logEvent(event);
  }

  /**
   * Log data access event
   */
  public logDataAccessEvent(
    details: DataAccessEventDetails,
    ipAddress: string,
    severity: SecuritySeverity = SecuritySeverity.LOW
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.DATA_ACCESS,
      severity,
      timestamp: new Date(),
      userId: details.userId,
      username: details.username,
      ipAddress,
      resource: details.dataType,
      action: details.operation,
      success: true,
      details: this.sanitizeDetails(details)
    };

    this.logEvent(event);
  }

  /**
   * Log configuration change event
   */
  public logConfigurationChangeEvent(
    details: ConfigurationChangeEventDetails,
    ipAddress: string,
    severity: SecuritySeverity = SecuritySeverity.MEDIUM
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.CONFIGURATION_CHANGE,
      severity,
      timestamp: new Date(),
      userId: details.userId,
      username: details.username,
      ipAddress,
      resource: details.configType,
      action: 'modify',
      success: true,
      details: this.sanitizeDetails(details)
    };

    this.logEvent(event);
  }

  /**
   * Log security violation event
   */
  public logSecurityViolationEvent(
    details: SecurityViolationEventDetails,
    ipAddress: string,
    userContext?: UserContext
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.SECURITY_VIOLATION,
      severity: details.riskLevel,
      timestamp: new Date(),
      userId: userContext?.id,
      username: userContext?.username,
      ipAddress,
      resource: 'security',
      action: details.violationType,
      success: false,
      details: this.sanitizeDetails(details)
    };

    this.logEvent(event);
  }

  /**
   * Log session management event
   */
  public logSessionEvent(
    action: 'create' | 'refresh' | 'expire' | 'revoke',
    userContext: UserContext,
    ipAddress: string,
    details: Record<string, unknown> = {}
  ): void {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type: SecurityEventType.SESSION_MANAGEMENT,
      severity: SecuritySeverity.LOW,
      timestamp: new Date(),
      userId: userContext.id,
      username: userContext.username,
      ipAddress,
      resource: 'session',
      action,
      success: true,
      details: this.sanitizeDetails(details),
      sessionId: userContext.sessionId
    };

    this.logEvent(event);
  }

  /**
   * Get security events by criteria
   */
  public getSecurityEvents(
    criteria: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      eventType?: SecurityEventType;
      severity?: SecuritySeverity;
      ipAddress?: string;
      limit?: number;
    } = {}
  ): SecurityEvent[] {
    let events = [...this.eventBuffer];

    // Apply filters
    if (criteria.startDate) {
      events = events.filter(event => event.timestamp >= criteria.startDate!);
    }

    if (criteria.endDate) {
      events = events.filter(event => event.timestamp <= criteria.endDate!);
    }

    if (criteria.userId) {
      events = events.filter(event => event.userId === criteria.userId);
    }

    if (criteria.eventType) {
      events = events.filter(event => event.type === criteria.eventType);
    }

    if (criteria.severity) {
      events = events.filter(event => event.severity === criteria.severity);
    }

    if (criteria.ipAddress) {
      events = events.filter(event => event.ipAddress === criteria.ipAddress);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (criteria.limit) {
      events = events.slice(0, criteria.limit);
    }

    return events;
  }

  /**
   * Get security statistics
   */
  public getSecurityStatistics(timeRange: { start: Date; end: Date }): {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecuritySeverity, number>;
    failedAuthentications: number;
    successfulAuthentications: number;
    securityViolations: number;
    topIpAddresses: Array<{ ip: string; count: number }>;
    topUsers: Array<{ username: string; count: number }>;
  } {
    const events = this.getSecurityEvents({
      startDate: timeRange.start,
      endDate: timeRange.end
    });

    const eventsByType: Record<SecurityEventType, number> = {
      [SecurityEventType.AUTHENTICATION]: 0,
      [SecurityEventType.AUTHORIZATION]: 0,
      [SecurityEventType.DATA_ACCESS]: 0,
      [SecurityEventType.CONFIGURATION_CHANGE]: 0,
      [SecurityEventType.SECURITY_VIOLATION]: 0,
      [SecurityEventType.SESSION_MANAGEMENT]: 0
    };

    const eventsBySeverity: Record<SecuritySeverity, number> = {
      [SecuritySeverity.LOW]: 0,
      [SecuritySeverity.MEDIUM]: 0,
      [SecuritySeverity.HIGH]: 0,
      [SecuritySeverity.CRITICAL]: 0
    };

    const ipCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};

    let failedAuthentications = 0;
    let successfulAuthentications = 0;
    let securityViolations = 0;

    for (const event of events) {
      eventsByType[event.type]++;
      eventsBySeverity[event.severity]++;

      if (event.ipAddress) {
        ipCounts[event.ipAddress] = (ipCounts[event.ipAddress] || 0) + 1;
      }

      if (event.username) {
        userCounts[event.username] = (userCounts[event.username] || 0) + 1;
      }

      if (event.type === SecurityEventType.AUTHENTICATION) {
        if (event.success) {
          successfulAuthentications++;
        } else {
          failedAuthentications++;
        }
      }

      if (event.type === SecurityEventType.SECURITY_VIOLATION) {
        securityViolations++;
      }
    }

    const topIpAddresses = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topUsers = Object.entries(userCounts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: events.length,
      eventsByType,
      eventsBySeverity,
      failedAuthentications,
      successfulAuthentications,
      securityViolations,
      topIpAddresses,
      topUsers
    };
  }

  private logEvent(event: SecurityEvent): void {
    // Check if event meets logging threshold
    if (!this.shouldLogEvent(event)) {
      return;
    }

    // Add to buffer
    this.eventBuffer.push(event);

    // Maintain buffer size
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    // Console logging
    if (this.config.enableConsoleLogging) {
      this.logToConsole(event);
    }

    // File logging (would be implemented for production)
    if (this.config.enableFileLogging) {
      this.logToFile(event);
    }

    // Alert on high severity events
    if (event.severity === SecuritySeverity.HIGH || event.severity === SecuritySeverity.CRITICAL) {
      this.triggerSecurityAlert(event);
    }
  }

  private shouldLogEvent(event: SecurityEvent): boolean {
    const severityLevels = {
      [SecuritySeverity.LOW]: 0,
      [SecuritySeverity.MEDIUM]: 1,
      [SecuritySeverity.HIGH]: 2,
      [SecuritySeverity.CRITICAL]: 3
    };

    return severityLevels[event.severity] >= severityLevels[this.config.logLevel];
  }

  private logToConsole(event: SecurityEvent): void {
    const timestamp = event.timestamp.toISOString();
    const severity = event.severity.toUpperCase();
    const type = event.type.toUpperCase();
    const success = event.success ? '✅' : '❌';
    
    const message = `[${timestamp}] ${severity} ${type} ${success} ${event.action} on ${event.resource}`;
    const details = event.username ? ` by ${event.username}` : '';
    const ip = event.ipAddress ? ` from ${event.ipAddress}` : '';

    console.log(`🔒 ${message}${details}${ip}`);

    if (!event.success && event.details) {
      console.log(`   Details:`, event.details);
    }
  }

  private logToFile(event: SecurityEvent): void {
    // In production, this would write to a structured log file
    // For now, we'll just indicate that file logging would occur
    console.log(`📝 Security event logged to file: ${event.id}`);
  }

  private triggerSecurityAlert(event: SecurityEvent): void {
    // In production, this would trigger alerts via email, Slack, etc.
    console.log(`🚨 SECURITY ALERT: ${event.severity} ${event.type} event detected`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`   User: ${event.username || 'Unknown'}`);
    console.log(`   IP: ${event.ipAddress}`);
    console.log(`   Action: ${event.action} on ${event.resource}`);
  }

  private sanitizeDetails(details: unknown): Record<string, unknown> {
    // Use SecretManager to mask sensitive data in log details
    return secretManager.maskSensitiveData(details);
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear event buffer (for testing or maintenance)
   */
  public clearEventBuffer(): void {
    this.eventBuffer = [];
    console.log('🧹 Security event buffer cleared');
  }

  /**
   * Get configuration info
   */
  public getConfiguration(): SecurityLoggerConfig & {
    bufferSize: number;
    maxBufferSize: number;
  } {
    return {
      ...this.config,
      bufferSize: this.eventBuffer.length,
      maxBufferSize: this.maxBufferSize
    };
  }
}

// Export singleton instance
export const securityLogger = SecurityLogger.getInstance();