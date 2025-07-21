import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { Equipment } from '../../context';
import './AssemblyTable.css';

interface AssemblyTableProps {
  equipment: Equipment;
  isActive: boolean;
}

const AssemblyTable: React.FC<AssemblyTableProps> = ({ equipment, isActive }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const robotArmRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableRef.current || !robotArmRef.current || !partsRef.current || !sparksRef.current) return;

    const tl = gsap.timeline({ repeat: -1 });

    if (isActive) {
      // Robot arm assembly animation
      tl.to(robotArmRef.current, {
        duration: 1,
        rotation: -45,
        transformOrigin: "bottom center",
        ease: "power2.inOut"
      })
      .to(robotArmRef.current, {
        duration: 0.5,
        rotation: -45,
        ease: "none"
      })
      .to(robotArmRef.current, {
        duration: 1,
        rotation: 0,
        ease: "power2.inOut"
      })
      .to(robotArmRef.current, {
        duration: 0.5,
        rotation: 45,
        ease: "power2.inOut"
      })
      .to(robotArmRef.current, {
        duration: 0.5,
        rotation: 45,
        ease: "none"
      })
      .to(robotArmRef.current, {
        duration: 1,
        rotation: 0,
        ease: "power2.inOut"
      });

      // Parts animation
      gsap.to(partsRef.current.children, {
        duration: 2,
        scale: 0.8,
        rotation: 360,
        stagger: 0.5,
        repeat: -1,
        ease: "power2.inOut"
      });

      // Sparks effect
      gsap.to(sparksRef.current.children, {
        duration: 0.3,
        scale: 0,
        opacity: 0,
        x: () => Math.random() * 20 - 10,
        y: () => Math.random() * 20 - 10,
        stagger: 0.05,
        repeat: -1,
        repeatDelay: 3,
        ease: "power2.out"
      });

    } else {
      // Stop animations
      gsap.killTweensOf([tableRef.current, robotArmRef.current, ...(partsRef.current?.children || []), ...(sparksRef.current?.children || [])]);
      gsap.set([tableRef.current, robotArmRef.current, partsRef.current.children, sparksRef.current.children], { clearProps: "all" });
    }

    return () => {
      tl.kill();
    };
  }, [isActive]);

  return (
    <div className="assembly-table" ref={tableRef}>
      <div className="table-surface">
        <div className="work-area">
          <div className="parts-container" ref={partsRef}>
            <div className="part part-1" />
            <div className="part part-2" />
            <div className="part part-3" />
            <div className="assembled-product" />
          </div>
          <div className="robot-arm" ref={robotArmRef}>
            <div className="arm-base" />
            <div className="arm-segment" />
            <div className="arm-tool" />
          </div>
        </div>
        <div className="table-controls">
          <div className="control-buttons">
            <div className="button active" />
            <div className="button" />
            <div className="button" />
          </div>
          <div className="status-display">
            <span className="status-text">ASSEMBLY</span>
          </div>
        </div>
      </div>
      <div className="sparks" ref={sparksRef}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="spark" />
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

export default AssemblyTable;