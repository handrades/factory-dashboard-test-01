import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './RuntimeSecurityMonitor.css';

interface SecurityAlert {
  id: string;
  type: 'rate_limit_exceeded' | 'suspicious_pattern' | 'anomalous_behavior' | 'threat_detected';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  source: string;
  details?: Record<string, any>;
}

interface SystemHealth {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  activeConnections: number;
  threatLevel: 'low' | 'medium' | 'high';
}

export const RuntimeSecurityMonitor: React.FC = () => {
  const { isAuthenticated, hasPermission } = useAuth();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    cpu: 45,
    memory: 62,
    disk: 78,
    network: 23,
    activeConnections: 156,
    threatLevel: 'low',
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Simulate real-time monitoring
  useEffect(() => {
    if (!isAuthenticated || !hasPermission('security', 'monitor')) {
      return;
    }

    setIsMonitoring(true);

    const monitoringInterval = setInterval(() => {
      // Simulate system health updates
      setSystemHealth(prev => ({
        cpu: Math.max(0, Math.min(100, prev.cpu + (Math.random() - 0.5) * 10)),
        memory: Math.max(0, Math.min(100, prev.memory + (Math.random() - 0.5) * 5)),
        disk: Math.max(0, Math.min(100, prev.disk + (Math.random() - 0.5) * 2)),
        network: Math.max(0, Math.min(100, prev.network + (Math.random() - 0.5) * 15)),
        activeConnections: Math.max(0, prev.activeConnections + Math.floor((Math.random() - 0.5) * 10)),
        threatLevel: Math.random() > 0.95 ? 'high' : Math.random() > 0.8 ? 'medium' : 'low',
      }));

      // Occasionally generate alerts
      if (Math.random() > 0.85) {
        const alertTypes: SecurityAlert['type'][] = [
          'rate_limit_exceeded',
          'suspicious_pattern',
          'anomalous_behavior',
          'threat_detected'
        ];
        
        const severities: SecurityAlert['severity'][] = ['info', 'warning', 'critical'];
        
        const messages = {
          rate_limit_exceeded: 'Rate limit exceeded for API endpoint',
          suspicious_pattern: 'Suspicious access pattern detected',
          anomalous_behavior: 'Anomalous user behavior identified',
          threat_detected: 'Potential security threat detected'
        };

        const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];
        const severity = severities[Math.floor(Math.random() * severities.length)];

        const newAlert: SecurityAlert = {
          id: `alert-${Date.now()}`,
          type,
          severity,
          message: messages[type],
          timestamp: new Date().toISOString(),
          source: ['Web Application', 'API Gateway', 'Database', 'Authentication Service'][
            Math.floor(Math.random() * 4)
          ],
          details: {
            ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
            endpoint: ['/api/auth/login', '/api/equipment', '/api/users'][Math.floor(Math.random() * 3)],
            count: Math.floor(Math.random() * 100) + 1,
          }
        };

        setAlerts(prev => [newAlert, ...prev.slice(0, 19)]); // Keep only last 20 alerts
      }
    }, 3000);

    return () => {
      clearInterval(monitoringInterval);
      setIsMonitoring(false);
    };
  }, [isAuthenticated, hasPermission]);

  const getHealthColor = (value: number) => {
    if (value > 80) return '#ff6b6b';
    if (value > 60) return '#ffa726';
    return '#66bb6a';
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'high': return '#ff4757';
      case 'medium': return '#ffa726';
      case 'low': return '#66bb6a';
      default: return '#9e9e9e';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📋';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rate_limit_exceeded': return '🚫';
      case 'suspicious_pattern': return '🔍';
      case 'anomalous_behavior': return '🤖';
      case 'threat_detected': return '⚔️';
      default: return '🛡️';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (!isAuthenticated) {
    return (
      <div className="runtime-monitor-container">
        <div className="access-denied">
          <h3>🔒 Authentication Required</h3>
          <p>Please sign in to view runtime security monitoring.</p>
        </div>
      </div>
    );
  }

  if (!hasPermission('security', 'monitor')) {
    return (
      <div className="runtime-monitor-container">
        <div className="access-denied">
          <h3>🛡️ Insufficient Permissions</h3>
          <p>You need security monitoring permissions to view this data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="runtime-security-monitor">
      <div className="monitor-header">
        <div className="header-info">
          <h2>🔍 Runtime Security Monitor</h2>
          <div className="monitoring-status">
            <span className={`status-indicator ${isMonitoring ? 'active' : 'inactive'}`}>
              {isMonitoring ? '🟢 Active' : '🔴 Inactive'}
            </span>
            <span className="last-update">
              Last update: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
        
        <div className="threat-level">
          <span className="threat-label">Threat Level:</span>
          <span 
            className={`threat-badge ${systemHealth.threatLevel}`}
            style={{ color: getThreatLevelColor(systemHealth.threatLevel) }}
          >
            {systemHealth.threatLevel.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="monitor-content">
        {/* System Health */}
        <div className="health-section">
          <h3>System Health</h3>
          <div className="health-metrics">
            <div className="health-metric">
              <div className="metric-header">
                <span className="metric-name">CPU Usage</span>
                <span className="metric-value" style={{ color: getHealthColor(systemHealth.cpu) }}>
                  {systemHealth.cpu.toFixed(1)}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className="metric-fill"
                  style={{ 
                    width: `${systemHealth.cpu}%`,
                    backgroundColor: getHealthColor(systemHealth.cpu)
                  }}
                />
              </div>
            </div>

            <div className="health-metric">
              <div className="metric-header">
                <span className="metric-name">Memory Usage</span>
                <span className="metric-value" style={{ color: getHealthColor(systemHealth.memory) }}>
                  {systemHealth.memory.toFixed(1)}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className="metric-fill"
                  style={{ 
                    width: `${systemHealth.memory}%`,
                    backgroundColor: getHealthColor(systemHealth.memory)
                  }}
                />
              </div>
            </div>

            <div className="health-metric">
              <div className="metric-header">
                <span className="metric-name">Disk Usage</span>
                <span className="metric-value" style={{ color: getHealthColor(systemHealth.disk) }}>
                  {systemHealth.disk.toFixed(1)}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className="metric-fill"
                  style={{ 
                    width: `${systemHealth.disk}%`,
                    backgroundColor: getHealthColor(systemHealth.disk)
                  }}
                />
              </div>
            </div>

            <div className="health-metric">
              <div className="metric-header">
                <span className="metric-name">Network Load</span>
                <span className="metric-value" style={{ color: getHealthColor(systemHealth.network) }}>
                  {systemHealth.network.toFixed(1)}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className="metric-fill"
                  style={{ 
                    width: `${systemHealth.network}%`,
                    backgroundColor: getHealthColor(systemHealth.network)
                  }}
                />
              </div>
            </div>
          </div>

          <div className="connection-info">
            <div className="connection-stat">
              <span className="stat-icon">🔗</span>
              <span className="stat-label">Active Connections</span>
              <span className="stat-value">{systemHealth.activeConnections}</span>
            </div>
          </div>
        </div>

        {/* Real-time Alerts */}
        <div className="alerts-section">
          <h3>Real-time Security Alerts</h3>
          <div className="alerts-list">
            {alerts.length === 0 ? (
              <div className="no-alerts">
                <div className="no-alerts-icon">✅</div>
                <p>No security alerts at this time</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} className={`alert-item ${alert.severity}`}>
                  <div className="alert-header">
                    <div className="alert-type">
                      <span className="type-icon">{getTypeIcon(alert.type)}</span>
                      <span className="severity-icon">{getSeverityIcon(alert.severity)}</span>
                    </div>
                    <div className="alert-meta">
                      <span className="alert-source">{alert.source}</span>
                      <span className="alert-time">{formatTimestamp(alert.timestamp)}</span>
                    </div>
                  </div>
                  
                  <div className="alert-content">
                    <div className="alert-message">{alert.message}</div>
                    {alert.details && (
                      <div className="alert-details">
                        {Object.entries(alert.details).map(([key, value]) => (
                          <span key={key} className="detail-item">
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuntimeSecurityMonitor;