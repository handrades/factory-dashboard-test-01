import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { Equipment } from '../../context/FactoryContext';
import './ConveyorBelt.css';

interface ConveyorBeltProps {
  equipment: Equipment;
  isActive: boolean;
}

const ConveyorBelt: React.FC<ConveyorBeltProps> = ({ equipment, isActive }) => {
  const beltRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const rollersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!beltRef.current || !itemsRef.current || !rollersRef.current) return;

    const tl = gsap.timeline({ repeat: -1 });

    if (isActive) {
      // Belt movement animation
      tl.to(beltRef.current, {
        duration: 2,
        backgroundPosition: "100px 0",
        ease: "none",
        repeat: -1
      });

      // Items moving on belt
      gsap.to(itemsRef.current.children, {
        duration: 3,
        x: 200,
        repeat: -1,
        stagger: 1,
        ease: "none",
        modifiers: {
          x: (x) => `${parseFloat(x) % 200}px`
        }
      });

      // Rollers rotation
      gsap.to(rollersRef.current.children, {
        duration: 1,
        rotation: 360,
        repeat: -1,
        ease: "none"
      });
    } else {
      // Stop animations
      gsap.killTweensOf([beltRef.current, itemsRef.current.children, rollersRef.current.children]);
      gsap.set([beltRef.current, itemsRef.current.children, rollersRef.current.children], { clearProps: "all" });
    }

    return () => {
      tl.kill();
    };
  }, [isActive]);

  return (
    <div className="conveyor-belt">
      <div className="belt-assembly">
        <div className="belt-surface" ref={beltRef} />
        <div className="belt-items" ref={itemsRef}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="belt-item" />
          ))}
        </div>
        <div className="belt-rollers" ref={rollersRef}>
          <div className="roller left" />
          <div className="roller right" />
        </div>
        <div className="belt-frame" />
      </div>
      <div className="belt-metrics">
        <div className="speed-display">
          <span className="metric-label">Speed</span>
          <span className="metric-value">{equipment.speed?.toFixed(2)} m/s</span>
        </div>
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

export default ConveyorBelt;