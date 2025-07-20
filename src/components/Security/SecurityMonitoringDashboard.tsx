import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ProtectedRoute } from '../Auth/ProtectedRoute';
import './SecurityMonitoringDashboard.css';

interface SecurityEvent {
  id: string;
  type: 'authentication' | 'authorization' | 'security_violation' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  user?: string;
  ip?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  details: string;
  resolved: boolean;
}

interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  failedLogins: number;
  suspiciousActivities: number;
  activeUsers: number;
  securityScore: number;
}

export const SecurityMonitoringDashboard: React.FC = () => {
  const { hasPermission } = useAuth();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalEvents: 0,
    criticalEvents: 0,
    failedLogins: 0,
    suspiciousActivities: 0,
    activeUsers: 0,
    securityScore: 85,
  });
  const [filter, setFilter] = useState<{
    severity?: string;
    type?: string;
    resolved?: boolean;
  }>({});
  const [isLoading, setIsLoading] = useState(true);

  // Mock data for demonstration
  useEffect(() => {
    const mockEvents: SecurityEvent[] = [
      {
        id: '1',
        type: 'authentication',
        severity: 'high',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        user: 'admin',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        action: 'Failed login attempt',
        details: 'Multiple failed login attempts detected',
        resolved: false,
      },
      {
        id: '2',
        type: 'authorization',
        severity: 'medium',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        user: 'operator1',
        ip: '192.168.1.105',
        action: 'Unauthorized access attempt',
        resource: '/admin/users',
        details: 'User attempted to access admin panel without proper permissions',
        resolved: true,
      },
      {
        id: '3',
        type: 'security_violation',
        severity: 'critical',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        ip: '203.0.113.1',
        action: 'SQL injection attempt',
        resource: '/api/equipment',
        details: 'Malicious SQL query detected in equipment search parameter',
        resolved: false,
      },
      {
        id: '4',
        type: 'system',
        severity: 'low',
        timestamp: new Date(Date.now() - 1200000).toISOString(),
        action: 'Security scan completed',
        details: 'Automated security scan finished with no critical issues',
        resolved: true,
      },
      {
        id: '5',
        type: 'authentication',
        severity: 'medium',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        user: 'viewer2',
        ip: '192.168.1.110',
        action: 'Unusual login location',
        details: 'Login detected from unusual geographic location',
        resolved: false,
      },
    ];

    const mockMetrics: SecurityMetrics = {
      totalEvents: mockEvents.length,
      criticalEvents: mockEvents.filter(e => e.severity === 'critical').length,
      failedLogins: mockEvents.filter(e => e.action.includes('Failed login')).length,
      suspiciousActivities: mockEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length,
      activeUsers: 8,
      securityScore: 85,
    };

    setTimeout(() => {
      setEvents(mockEvents);
      setMetrics(mockMetrics);
      setIsLoading(false);
    }, 1000);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ff4757';
      case 'high': return '#ff6b6b';
      case 'medium': return '#ffa726';
      case 'low': return '#66bb6a';
      default: return '#9e9e9e';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'authentication': return '🔐';
      case 'authorization': return '🛡️';
      case 'security_violation': return '⚠️';
      case 'system': return '⚙️';
      default: return '📋';
    }
  };

  const filteredEvents = events.filter(event => {
    if (filter.severity && event.severity !== filter.severity) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.resolved !== undefined && event.resolved !== filter.resolved) return false;
    return true;
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffMs = now.getTime() - eventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <ProtectedRoute
      requiredPermission={{ resource: 'security', action: 'monitor' }}
      showLoginModal={false}
      fallback={
        <div className="security-access-denied">
          <h2>🔒 Security Monitoring Access Denied</h2>
          <p>You need security monitoring permissions to view this dashboard.</p>
        </div>
      }
    >
      <div className="security-monitoring-dashboard">
        <div className="dashboard-header">
          <div className="header-content">
            <h1>🛡️ Security Monitoring</h1>
            <p>Real-time security event monitoring and threat detection</p>
          </div>
          <div className="security-score">
            <div className="score-circle">
              <span className="score-value">{metrics.securityScore}</span>
              <span className="score-label">Security Score</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading security data...</p>
          </div>
        ) : (
          <>
            {/* Security Metrics */}
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-icon">📊</div>
                <div className="metric-content">
                  <div className="metric-value">{metrics.totalEvents}</div>
                  <div className="metric-label">Total Events</div>
                </div>
              </div>
              
              <div className="metric-card critical">
                <div className="metric-icon">🚨</div>
                <div className="metric-content">
                  <div className="metric-value">{metrics.criticalEvents}</div>
                  <div className="metric-label">Critical Events</div>
                </div>
              </div>
              
              <div className="metric-card">
                <div className="metric-icon">🔒</div>
                <div className="metric-content">
                  <div className="metric-value">{metrics.failedLogins}</div>
                  <div className="metric-label">Failed Logins</div>
                </div>
              </div>
              
              <div className="metric-card">
                <div className="metric-icon">⚠️</div>
                <div className="metric-content">
                  <div className="metric-value">{metrics.suspiciousActivities}</div>
                  <div className="metric-label">Suspicious Activities</div>
                </div>
              </div>
              
              <div className="metric-card">
                <div className="metric-icon">👥</div>
                <div className="metric-content">
                  <div className="metric-value">{metrics.activeUsers}</div>
                  <div className="metric-label">Active Users</div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="filters-section">
              <h3>Filter Events</h3>
              <div className="filters-row">
                <select
                  value={filter.severity || ''}
                  onChange={(e) => setFilter({...filter, severity: e.target.value || undefined})}
                  className="filter-select"
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                
                <select
                  value={filter.type || ''}
                  onChange={(e) => setFilter({...filter, type: e.target.value || undefined})}
                  className="filter-select"
                >
                  <option value="">All Types</option>
                  <option value="authentication">Authentication</option>
                  <option value="authorization">Authorization</option>
                  <option value="security_violation">Security Violation</option>
                  <option value="system">System</option>
                </select>
                
                <select
                  value={filter.resolved?.toString() || ''}
                  onChange={(e) => setFilter({...filter, resolved: e.target.value === '' ? undefined : e.target.value === 'true'})}
                  className="filter-select"
                >
                  <option value="">All Statuses</option>
                  <option value="false">Unresolved</option>
                  <option value="true">Resolved</option>
                </select>
                
                <button
                  onClick={() => setFilter({})}
                  className="clear-filters-btn"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Events List */}
            <div className="events-section">
              <h3>Security Events ({filteredEvents.length})</h3>
              <div className="events-list">
                {filteredEvents.length === 0 ? (
                  <div className="no-events">
                    <div className="no-events-icon">🔍</div>
                    <p>No security events match the current filters.</p>
                  </div>
                ) : (
                  filteredEvents.map(event => (
                    <div
                      key={event.id}
                      className={`event-card ${event.severity} ${event.resolved ? 'resolved' : 'unresolved'}`}
                    >
                      <div className="event-header">
                        <div className="event-type">
                          <span className="type-icon">{getTypeIcon(event.type)}</span>
                          <span className="type-label">{event.type.replace('_', ' ')}</span>
                        </div>
                        <div className="event-metadata">
                          <span className={`severity-badge ${event.severity}`}>
                            {event.severity.toUpperCase()}
                          </span>
                          <span className="timestamp" title={formatTimestamp(event.timestamp)}>
                            {getRelativeTime(event.timestamp)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="event-content">
                        <div className="event-action">{event.action}</div>
                        <div className="event-details">{event.details}</div>
                        
                        {(event.user || event.ip || event.resource) && (
                          <div className="event-context">
                            {event.user && <span className="context-item">👤 {event.user}</span>}
                            {event.ip && <span className="context-item">🌐 {event.ip}</span>}
                            {event.resource && <span className="context-item">📍 {event.resource}</span>}
                          </div>
                        )}
                      </div>
                      
                      <div className="event-status">
                        <span className={`status-indicator ${event.resolved ? 'resolved' : 'unresolved'}`}>
                          {event.resolved ? '✅ Resolved' : '🔴 Unresolved'}
                        </span>
                        {hasPermission('security', 'manage') && !event.resolved && (
                          <button className="resolve-btn">
                            Mark as Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default SecurityMonitoringDashboard;