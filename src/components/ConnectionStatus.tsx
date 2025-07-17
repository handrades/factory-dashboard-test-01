import React from 'react';
import { useFactory } from '../context/FactoryContext';
import './ConnectionStatus.css';

export const ConnectionStatus: React.FC = () => {
  const { isConnectedToInfluxDB, isUsingFallbackData, connectionStatus } = useFactory();

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
    if (isConnectedToInfluxDB) {
      return 'Real-time data';
    }
    if (isUsingFallbackData) {
      return 'Simulated data';
    }
    return 'No data';
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

  return (
    <div className={`connection-status ${getStatusClass()}`}>
      <span className="connection-status__icon">{getStatusIcon()}</span>
      <span className="connection-status__text">{getStatusText()}</span>
      {connectionStatus === 'connecting' && (
        <div className="connection-status__spinner"></div>
      )}
    </div>
  );
};