import React, { useState } from 'react';
import { useFactory, type EnvironmentInfo } from '../context';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  detailed?: boolean;
}

interface DiagnosticInfo {
  diagnostics: {
    lastConnectionAttempt: string;
    consecutiveFailures: number;
    lastError?: string;
    errorType?: string;
  };
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ detailed = false }) => {
  const { 
    isConnectedToInfluxDB, 
    isUsingFallbackData, 
    connectionStatus,
    dataSource,
    environmentInfo,
    lastDataUpdate,
    forceReconnect,
    forceClearCache,
    getDataSourceInfo
  } = useFactory();

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await forceReconnect();
    } finally {
      setIsReconnecting(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'disconnected':
        return '🔴';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusText = () => {
    if (dataSource === 'simulation') {
      return environmentInfo?.environment === 'github-pages' 
        ? 'Simulation Mode (GitHub Pages)'
        : 'Simulation Mode';
    }
    
    switch (connectionStatus) {
      case 'connected':
        return 'InfluxDB Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'InfluxDB Disconnected';
      case 'error':
        return 'InfluxDB Connection Error';
      default:
        return 'Unknown Status';
    }
  };

  const getStatusClass = () => {
    if (isConnectedToInfluxDB) {
      return 'connection-status--connected';
    }
    if (isUsingFallbackData) {
      return 'connection-status--fallback';
    }
    return 'connection-status--error';
  };

  if (!detailed) {
    return (
      <div className={`connection-status ${getStatusClass()}`}>
        <span className="connection-status__icon">{getStatusIcon()}</span>
        <span className="connection-status__text">{getStatusText()}</span>
        {connectionStatus === 'connecting' && (
          <div className="connection-status__spinner"></div>
        )}
      </div>
    );
  }

  return (
    <div className={`connection-status connection-status--detailed ${getStatusClass()}`}>
      <div className="connection-status__header">
        <div className="connection-status__main">
          <span className="connection-status__icon">{getStatusIcon()}</span>
          <div className="connection-status__info">
            <span className="connection-status__text">{getStatusText()}</span>
            <span className="connection-status__subtext">
              Data Source: {dataSource === 'influxdb' ? 'InfluxDB' : 'Simulation'}
            </span>
          </div>
        </div>
        
        <div className="connection-status__actions">
          {dataSource === 'influxdb' && connectionStatus !== 'connected' && (
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="connection-status__reconnect-btn"
            >
              {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
            </button>
          )}
          
          {dataSource === 'influxdb' && (
            <button
              onClick={forceClearCache}
              className="connection-status__cache-btn"
              title="Clear cache and force fresh data"
            >
              Clear Cache
            </button>
          )}
          
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="connection-status__details-btn"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      {connectionStatus === 'connecting' && (
        <div className="connection-status__spinner"></div>
      )}

      {showDetails && (
        <ConnectionDetails 
          environmentInfo={environmentInfo}
          dataSource={dataSource}
          lastDataUpdate={lastDataUpdate}
          getDataSourceInfo={getDataSourceInfo}
        />
      )}
    </div>
  );
};

interface ConnectionDetailsProps {
  environmentInfo: EnvironmentInfo;
  dataSource: 'influxdb' | 'simulation';
  lastDataUpdate: Date | null;
  getDataSourceInfo: () => unknown;
}

const ConnectionDetails: React.FC<ConnectionDetailsProps> = ({ 
  environmentInfo, 
  dataSource, 
  lastDataUpdate,
  getDataSourceInfo 
}) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null);

  React.useEffect(() => {
    const updateDiagnostics = () => {
      const info = getDataSourceInfo() as DiagnosticInfo | null;
      setDiagnostics(info);
    };

    updateDiagnostics();
    const interval = setInterval(updateDiagnostics, 5000);

    return () => clearInterval(interval);
  }, [getDataSourceInfo]);

  return (
    <div className="connection-status__details">
      <div className="connection-status__details-grid">
        <div className="connection-status__detail-item">
          <span className="connection-status__detail-label">Environment:</span>
          <span className="connection-status__detail-value">
            {environmentInfo?.environment || 'Unknown'}
          </span>
        </div>
        
        <div className="connection-status__detail-item">
          <span className="connection-status__detail-label">Data Source:</span>
          <span className="connection-status__detail-value">
            {dataSource === 'influxdb' ? 'Real-time InfluxDB' : 'Simulation'}
          </span>
        </div>
        
        <div className="connection-status__detail-item">
          <span className="connection-status__detail-label">InfluxDB URL:</span>
          <span className="connection-status__detail-value connection-status__detail-url">
            {environmentInfo?.influxDBUrl || 'Not configured'}
          </span>
        </div>
        
        <div className="connection-status__detail-item">
          <span className="connection-status__detail-label">Production:</span>
          <span className="connection-status__detail-value">
            {environmentInfo?.isProduction ? 'Yes' : 'No'}
          </span>
        </div>
        
        <div className="connection-status__detail-item">
          <span className="connection-status__detail-label">Last Data Update:</span>
          <span className="connection-status__detail-value">
            {lastDataUpdate ? lastDataUpdate.toLocaleTimeString() : 'Never'}
          </span>
        </div>
      </div>

      {dataSource === 'influxdb' && diagnostics?.diagnostics && (
        <div className="connection-status__diagnostics">
          <h4 className="connection-status__diagnostics-title">Connection Diagnostics</h4>
          <div className="connection-status__diagnostics-grid">
            <div className="connection-status__diagnostic-item">
              <span>Last Attempt:</span>
              <span>{new Date(diagnostics.diagnostics.lastConnectionAttempt).toLocaleTimeString()}</span>
            </div>
            
            <div className="connection-status__diagnostic-item">
              <span>Consecutive Failures:</span>
              <span className={diagnostics.diagnostics.consecutiveFailures > 0 ? 'error' : 'success'}>
                {diagnostics.diagnostics.consecutiveFailures}
              </span>
            </div>
            
            {diagnostics.diagnostics.lastError && (
              <div className="connection-status__diagnostic-item">
                <span>Last Error:</span>
                <span className="error" title={diagnostics.diagnostics.lastError}>
                  {diagnostics.diagnostics.lastError.length > 30 
                    ? diagnostics.diagnostics.lastError.substring(0, 30) + '...'
                    : diagnostics.diagnostics.lastError}
                </span>
              </div>
            )}
            
            {diagnostics.diagnostics.errorType && (
              <div className="connection-status__diagnostic-item">
                <span>Error Type:</span>
                <span className="error">{diagnostics.diagnostics.errorType}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};