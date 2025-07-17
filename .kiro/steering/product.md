# Factory Dashboard

## Product Overview
Factory Dashboard is a modern, interactive monitoring system for manufacturing environments. It provides real-time visualization and monitoring of production lines, equipment status, and manufacturing processes.

## Core Features
- Multi-line production monitoring (5 production lines)
- Interactive equipment visualization with real-time animations
- Equipment status tracking (running, stopped, error states)
- Performance metrics and efficiency calculations
- Responsive design for various device types

## Key Components
- **Dashboard View**: Overview of all production lines with status indicators
- **Line Detail View**: Detailed view of individual production line with equipment flow
- **Equipment Components**: Interactive visualizations of industrial equipment:
  - Industrial Ovens (with temperature monitoring)
  - Conveyor Belts (with speed control)
  - Hydraulic Presses (with pressure monitoring)
  - Assembly Tables (with robotic components)

## Data Architecture
- Real-time data from InfluxDB (primary data source)
- Fallback simulation data when InfluxDB is unavailable
- PLC emulator service that generates equipment data
- Queue consumer service that processes and stores data

## Target Users
- Factory floor managers and supervisors
- Production engineers
- Operations teams monitoring manufacturing processes