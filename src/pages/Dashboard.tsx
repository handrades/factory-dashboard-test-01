import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFactory } from '../context/FactoryContext';
import { ConnectionStatus } from '../components/ConnectionStatus';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { lines } = useFactory();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#4CAF50';
      case 'stopped': return '#9E9E9E';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const handleLineClick = (lineId: number) => {
    navigate(`/line/${lineId}`);
  };

  return (
    <div className="dashboard">
      <ConnectionStatus />
      <header className="dashboard-header">
        <h1>Factory Dashboard</h1>
        <p>Monitor and control all production lines</p>
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
    </div>
  );
};

export default Dashboard;