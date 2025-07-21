import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFactory } from '../context';
import { useAuth } from '../hooks/useAuth';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { LoginForm } from '../components/Auth/LoginForm';
import { UserMenu } from '../components/Auth/UserMenu';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { lines } = useFactory();
  const { isAuthenticated, hasPermission } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#4CAF50';
      case 'stopped': return '#9E9E9E';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const handleLineClick = (lineId: number) => {
    // For development/demo purposes, allow navigation without authentication
    // In production, uncomment the authentication checks below
    
    // Check permissions before navigating
    // if (!isAuthenticated) {
    //   setShowLogin(true);
    //   return;
    // }
    
    // if (!hasPermission('dashboard', 'read')) {
    //   alert('You do not have permission to view line details.');
    //   return;
    // }
    
    navigate(`/line/${lineId}`);
  };

  return (
    <div className="dashboard">
      <ConnectionStatus />
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Factory Dashboard</h1>
            <p>Monitor and control all production lines</p>
          </div>
          <div className="header-actions">
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <button 
                className="login-button"
                onClick={() => setShowLogin(true)}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="lines-grid">
        {lines.map(line => (
          <div
            key={line.id}
            className="line-card"
            onClick={() => handleLineClick(line.id)}
            style={{ '--status-color': getStatusColor(line.status) } as React.CSSProperties}
          >
            <div className="line-header">
              <h2>{line.name}</h2>
              <div className="status-indicator" />
            </div>
            
            <div className="line-stats">
              <div className="stat">
                <span className="stat-label">Status</span>
                <span className="stat-value">{line.status.toUpperCase()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Efficiency</span>
                <span className="stat-value">{line.efficiency.toFixed(2)}%</span>
              </div>
              <div className="stat">
                <span className="stat-label">Equipment</span>
                <span className="stat-value">{line.equipment.length}</span>
              </div>
            </div>

            <div className="equipment-preview">
              {line.equipment.map(equipment => (
                <div
                  key={equipment.id}
                  className="equipment-icon"
                  style={{ '--equipment-color': getStatusColor(equipment.status) } as React.CSSProperties}
                  title={equipment.name}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Authentication Modal */}
      {showLogin && (
        <LoginForm 
          onSuccess={() => setShowLogin(false)}
        />
      )}
      
      {/* Permission Notice */}
      {isAuthenticated && !hasPermission('dashboard:read') && (
        <div className="permission-notice">
          <div className="notice-content">
            <h3>🔒 Limited Access</h3>
            <p>Your current role has restricted dashboard access. Contact your administrator for elevated permissions.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;