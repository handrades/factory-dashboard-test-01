import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { Equipment } from '../../context/FactoryContext';
import './Press.css';

interface PressProps {
  equipment: Equipment;
  isActive: boolean;
}

const Press: React.FC<PressProps> = ({ equipment, isActive }) => {
  const pressRef = useRef<HTMLDivElement>(null);
  const pistonRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pressRef.current || !pistonRef.current || !gaugeRef.current || !particlesRef.current) return;

    const tl = gsap.timeline({ repeat: -1 });

    if (isActive) {
      // Piston compression animation
      tl.to(pistonRef.current, {
        duration: 0.8,
        y: 30,
        ease: "power2.out"
      })
      .to(pistonRef.current, {
        duration: 0.2,
        y: 30,
        ease: "none"
      })
      .to(pistonRef.current, {
        duration: 0.6,
        y: 0,
        ease: "power2.in"
      })
      .to(pistonRef.current, {
        duration: 1,
        y: 0,
        ease: "none"
      });

      // Pressure gauge animation
      gsap.to(gaugeRef.current, {
        duration: 1.6,
        rotation: 180,
        repeat: -1,
        ease: "power2.inOut",
        transformOrigin: "50% 100%"
      });

      // Particles effect on compression
      gsap.to(particlesRef.current.children, {
        duration: 0.5,
        scale: 0.5,
        opacity: 0,
        y: -20,
        stagger: 0.1,
        repeat: -1,
        repeatDelay: 2,
        ease: "power2.out"
      });

      // Press vibration
      gsap.to(pressRef.current, {
        duration: 0.1,
        x: 1,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });
    } else {
      // Stop animations
      gsap.killTweensOf([pressRef.current, pistonRef.current, gaugeRef.current, ...(particlesRef.current?.children || [])]);
      gsap.set([pressRef.current, pistonRef.current, gaugeRef.current, particlesRef.current.children], { clearProps: "all" });
    }

    return () => {
      tl.kill();
    };
  }, [isActive]);

  return (
    <div className="press" ref={pressRef}>
      <div className="press-body">
        <div className="press-frame">
          <div className="piston" ref={pistonRef}>
            <div className="piston-head" />
            <div className="piston-rod" />
          </div>
          <div className="press-base">
            <div className="work-piece" />
          </div>
        </div>
        <div className="press-controls">
          <div className="pressure-gauge">
            <div className="gauge-face">
              <div className="gauge-needle" ref={gaugeRef} />
              <div className="gauge-center" />
            </div>
            <div className="gauge-label">PSI</div>
          </div>
          <div className="control-panel">
            <div className="indicator-light running" />
            <div className="pressure-display">
              {equipment.pressure?.toFixed(2)} bar
            </div>
          </div>
        </div>
      </div>
      <div className="particles" ref={particlesRef}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="particle" />
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

export default Press;