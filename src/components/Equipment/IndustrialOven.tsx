import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { Equipment } from '../../context';
import './IndustrialOven.css';

interface IndustrialOvenProps {
  equipment: Equipment;
  isActive: boolean;
}

const IndustrialOven: React.FC<IndustrialOvenProps> = ({ equipment, isActive }) => {
  const ovenRef = useRef<HTMLDivElement>(null);
  const flameRef = useRef<HTMLDivElement>(null);
  const temperatureRef = useRef<HTMLDivElement>(null);
  const heatWavesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ovenRef.current || !flameRef.current || !heatWavesRef.current) return;

    const tl = gsap.timeline({ repeat: -1 });

    if (isActive) {
      // Flame animation
      tl.to(flameRef.current, {
        duration: 0.5,
        scale: 1.2,
        opacity: 0.9,
        ease: "power2.inOut",
        yoyo: true,
        repeat: -1
      });

      // Heat waves animation
      gsap.to(heatWavesRef.current.children, {
        duration: 1,
        y: -20,
        opacity: 0,
        stagger: 0.1,
        repeat: -1,
        ease: "power2.out"
      });

      // Oven glow effect
      gsap.to(ovenRef.current, {
        duration: 2,
        boxShadow: "0 0 20px rgba(255, 100, 0, 0.6)",
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });
    } else {
      // Stop animations
      gsap.killTweensOf([ovenRef.current, flameRef.current, heatWavesRef.current.children]);
      gsap.set([ovenRef.current, flameRef.current], { clearProps: "all" });
    }

    return () => {
      tl.kill();
    };
  }, [isActive]);

  return (
    <div className="industrial-oven" ref={ovenRef}>
      <div className="oven-body">
        <div className="oven-door">
          <div className="door-window">
            <div className="flame" ref={flameRef} />
          </div>
          <div className="door-handle" />
        </div>
        <div className="oven-controls">
          <div className="control-knob" />
          <div className="control-knob" />
          <div className="display">
            <span className="temperature" ref={temperatureRef}>
              {equipment.temperature?.toFixed(2)}°C
            </span>
          </div>
        </div>
      </div>
      <div className="heat-waves" ref={heatWavesRef}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="heat-wave" />
        ))}
      </div>
      <div className="equipment-label">
        <h3>{equipment.name}</h3>
        <span className={`status ${equipment.status}`}>
          {equipment.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default IndustrialOven;