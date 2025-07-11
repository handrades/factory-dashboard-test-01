import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFactory } from '../context/FactoryContext';
import IndustrialOven from '../components/Equipment/IndustrialOven';
import ConveyorBelt from '../components/Equipment/ConveyorBelt';
import Press from '../components/Equipment/Press';
import AssemblyTable from '../components/Equipment/AssemblyTable';
import './LineDetail.css';

const LineDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getLine } = useFactory();
  const containerRef = useRef<HTMLDivElement>(null);

  const lineId = parseInt(id || '1', 10);
  const line = getLine(lineId);

  useEffect(() => {
    if (!line) {
      navigate('/');
    }
  }, [line, navigate]);

  if (!line) {
    return <div>Line not found</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#4CAF50';
      case 'stopped': return '#9E9E9E';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <div className="line-detail">
      <header className="line-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
        <div className="line-info">
          <h1>{line.name}</h1>
          <div className="line-status">
            <span 
              className="status-dot"
              style={{ backgroundColor: getStatusColor(line.status) }}
            />
            <span className="status-text">{line.status.toUpperCase()}</span>
            <span className="efficiency">Efficiency: {line.efficiency}%</span>
          </div>
        </div>
      </header>

      <div className="equipment-flow" ref={containerRef}>
        <div className="flow-container">
          {line.equipment.map((equipment, index) => {
            const Component = getEquipmentComponent(equipment.type);
            return (
              <div key={equipment.id} className="equipment-wrapper">
                <Component 
                  equipment={equipment} 
                  isActive={line.status === 'running' && equipment.status === 'running'}
                />
                {index < line.equipment.length - 1 && (
                  <div className="flow-arrow">
                    <div className="arrow-line" />
                    <div className="arrow-head" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="equipment-details">
        <h2>Equipment Status</h2>
        <div className="equipment-grid">
          {line.equipment.map(equipment => (
            <div key={equipment.id} className="equipment-card">
              <div className="equipment-header">
                <h3>{equipment.name}</h3>
                <span 
                  className="equipment-status"
                  style={{ color: getStatusColor(equipment.status) }}
                >
                  {equipment.status.toUpperCase()}
                </span>
              </div>
              <div className="equipment-metrics">
                {equipment.temperature && (
                  <div className="metric">
                    <span className="metric-label">Temperature</span>
                    <span className="metric-value">{equipment.temperature}°C</span>
                  </div>
                )}
                {equipment.speed && (
                  <div className="metric">
                    <span className="metric-label">Speed</span>
                    <span className="metric-value">{equipment.speed} m/s</span>
                  </div>
                )}
                {equipment.pressure && (
                  <div className="metric">
                    <span className="metric-label">Pressure</span>
                    <span className="metric-value">{equipment.pressure} bar</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const getEquipmentComponent = (type: string) => {
  switch (type) {
    case 'oven': return IndustrialOven;
    case 'conveyor': return ConveyorBelt;
    case 'press': return Press;
    case 'assembly': return AssemblyTable;
    default: return IndustrialOven;
  }
};

export default LineDetail;