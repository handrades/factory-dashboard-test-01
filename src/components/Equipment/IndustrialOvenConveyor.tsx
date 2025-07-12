import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { Equipment } from '../../context/FactoryContext';
import './IndustrialOvenConveyor.css';

interface IndustrialOvenConveyorProps {
  equipment: Equipment;
  isActive: boolean;
}

const IndustrialOvenConveyor: React.FC<IndustrialOvenConveyorProps> = ({ equipment, isActive }) => {
  const ovenRef = useRef<HTMLDivElement>(null);
  const flameRef = useRef<HTMLDivElement>(null);
  const heatWavesRef = useRef<HTMLDivElement>(null);
  const conveyorRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const rollersRef = useRef<HTMLDivElement>(null);
  const temperatureRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const exhaustRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ovenRef.current || !flameRef.current || !heatWavesRef.current || !conveyorRef.current || !itemsRef.current || !rollersRef.current || !fanRef.current || !exhaustRef.current) return;

    const tl = gsap.timeline({ repeat: -1 });

    if (isActive) {
      // Oven flame animation - more intense for industrial oven
      tl.to(flameRef.current, {
        duration: 0.3,
        scale: 1.3,
        opacity: 1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: -1
      });

      // Multiple heat waves for robust oven
      gsap.to(heatWavesRef.current.children, {
        duration: 0.8,
        y: -30,
        opacity: 0,
        stagger: 0.08,
        repeat: -1,
        ease: "power2.out"
      });

      // Enhanced oven glow effect
      gsap.to(ovenRef.current, {
        duration: 1.5,
        boxShadow: "0 0 30px rgba(255, 80, 0, 0.8), inset 0 0 20px rgba(255, 120, 0, 0.3)",
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });

      // Conveyor belt movement
      gsap.to(conveyorRef.current, {
        duration: 1.5,
        backgroundPosition: "120px 0",
        ease: "none",
        repeat: -1
      });

      // Items moving through oven on conveyor
      gsap.to(itemsRef.current.children, {
        duration: 4,
        x: 280,
        repeat: -1,
        stagger: 1.5,
        ease: "none",
        modifiers: {
          x: (x) => `${parseFloat(x) % 300}px`
        }
      });

      // Conveyor rollers rotation
      gsap.to(rollersRef.current.children, {
        duration: 1,
        rotation: 360,
        repeat: -1,
        ease: "none"
      });

      // Exhaust fan rotation
      gsap.to(fanRef.current, {
        duration: 0.5,
        rotation: 360,
        repeat: -1,
        ease: "none"
      });

      // Exhaust steam/smoke
      gsap.to(exhaustRef.current.children, {
        duration: 1.2,
        y: -40,
        opacity: 0,
        scale: 1.5,
        stagger: 0.1,
        repeat: -1,
        ease: "power2.out"
      });

      // Temperature display flicker for realism
      gsap.to(temperatureRef.current, {
        duration: 0.1,
        opacity: 0.8,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });

    } else {
      // Stop all animations
      gsap.killTweensOf([
        ovenRef.current, 
        flameRef.current, 
        heatWavesRef.current.children,
        conveyorRef.current,
        itemsRef.current.children,
        rollersRef.current.children,
        fanRef.current,
        exhaustRef.current.children,
        temperatureRef.current
      ]);
      gsap.set([
        ovenRef.current, 
        flameRef.current, 
        conveyorRef.current,
        itemsRef.current.children,
        rollersRef.current.children,
        fanRef.current,
        exhaustRef.current.children,
        temperatureRef.current
      ], { clearProps: "all" });
    }

    return () => {
      tl.kill();
    };
  }, [isActive]);

  return (
    <div className="industrial-oven-conveyor">
      <div className="oven-conveyor-assembly" ref={ovenRef}>
        {/* Conveyor System */}
        <div className="conveyor-system">
          <div className="ioc-conveyor-belt" ref={conveyorRef} />
          <div className="conveyor-items" ref={itemsRef}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="conveyor-item" />
            ))}
          </div>
          <div className="conveyor-rollers" ref={rollersRef}>
            <div className="ioc-roller input" />
            <div className="ioc-roller middle-1" />
            <div className="ioc-roller middle-2" />
            <div className="ioc-roller output" />
          </div>
        </div>

        {/* Oven Chamber */}
        <div className="oven-chamber">
          <div className="ioc-oven-body">
            <div className="oven-interior">
              <div className="flame-burners">
                <div className="ioc-flame" ref={flameRef} />
                <div className="ioc-flame secondary" />
                <div className="ioc-flame tertiary" />
              </div>
              <div className="heating-elements">
                <div className="element top" />
                <div className="element bottom" />
              </div>
            </div>
            <div className="ioc-oven-door">
              <div className="ioc-door-window">
                <div className="window-grid" />
              </div>
              <div className="ioc-door-handle" />
              <div className="door-insulation" />
            </div>
          </div>
          
          {/* Control Panel */}
          <div className="control-panel">
            <div className="control-section">
              <div className="control-knobs">
                <div className="ioc-control-knob temp" />
                <div className="ioc-control-knob speed" />
                <div className="ioc-control-knob power" />
              </div>
              <div className="displays">
                <div className="temperature-display">
                  <span className="ioc-display-label">TEMP</span>
                  <span className="ioc-display-value" ref={temperatureRef}>
                    {equipment.temperature?.toFixed(2)}°C
                  </span>
                </div>
                <div className="speed-display">
                  <span className="ioc-display-label">SPEED</span>
                  <span className="ioc-display-value">
                    {equipment.speed?.toFixed(2)} m/s
                  </span>
                </div>
              </div>
            </div>
            <div className="status-indicators">
              <div className="indicator heating" />
              <div className="indicator conveyor" />
              <div className="indicator ready" />
            </div>
          </div>
        </div>

        {/* Exhaust System */}
        <div className="exhaust-system">
          <div className="exhaust-duct">
            <div className="exhaust-fan" ref={fanRef}>
              <div className="fan-blade" />
              <div className="fan-blade" />
              <div className="fan-blade" />
              <div className="fan-blade" />
            </div>
          </div>
          <div className="exhaust-output" ref={exhaustRef}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="exhaust-particle" />
            ))}
          </div>
        </div>
      </div>

      {/* Heat Waves */}
      <div className="ioc-heat-waves" ref={heatWavesRef}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="ioc-heat-wave" />
        ))}
      </div>

      {/* Equipment Label */}
      <div className="equipment-label">
        <h3>{equipment.name}</h3>
        <span className={`status ${equipment.status}`}>
          {equipment.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default IndustrialOvenConveyor;