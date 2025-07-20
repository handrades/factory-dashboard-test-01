# Requirements Document

## Introduction

The factory dashboard currently has InfluxDB integration code but is not successfully connecting to and displaying real-time data from the InfluxDB database. The dashboard falls back to simulated data instead of showing actual equipment metrics stored in InfluxDB. This feature will ensure reliable connection between the dashboard and InfluxDB, proper data retrieval, and real-time updates of equipment status and metrics.

## Requirements

### Requirement 1

**User Story:** As a factory manager, I want the dashboard to display real-time equipment data from InfluxDB, so that I can monitor actual production line performance and equipment status.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN it SHALL successfully connect to InfluxDB using the configured connection parameters
2. WHEN InfluxDB contains equipment data THEN the dashboard SHALL retrieve and display the latest equipment metrics instead of fallback simulation data
3. WHEN equipment data is updated in InfluxDB THEN the dashboard SHALL reflect these changes within 5 seconds
4. WHEN the InfluxDB connection is successful THEN the connection status indicator SHALL show "connected" state

### Requirement 2

**User Story:** As a production engineer, I want to see accurate equipment status indicators (running/stopped/error), so that I can quickly identify equipment issues and take corrective action.

#### Acceptance Criteria

1. WHEN equipment is actively sending data to InfluxDB THEN the equipment status SHALL show as "running"
2. WHEN equipment has not sent data for more than 30 seconds THEN the equipment status SHALL show as "stopped"
3. WHEN equipment has not sent data for more than 2 minutes THEN the equipment status SHALL show as "error"
4. WHEN equipment status changes THEN the visual indicators SHALL update immediately on the dashboard

### Requirement 3

**User Story:** As a system administrator, I want proper error handling and fallback mechanisms, so that the dashboard remains functional even when InfluxDB is temporarily unavailable.

#### Acceptance Criteria

1. WHEN InfluxDB is unavailable THEN the dashboard SHALL automatically switch to fallback simulation data
2. WHEN InfluxDB connection is restored THEN the dashboard SHALL automatically reconnect and switch back to real data
3. WHEN connection errors occur THEN the system SHALL log appropriate error messages for debugging
4. WHEN using fallback data THEN the dashboard SHALL clearly indicate that simulated data is being displayed

### Requirement 4

**User Story:** As a factory operator, I want to see real-time equipment metrics (temperature, speed, pressure), so that I can monitor equipment performance and efficiency.

#### Acceptance Criteria

1. WHEN oven equipment is active THEN the dashboard SHALL display current temperature readings from InfluxDB
2. WHEN conveyor equipment is active THEN the dashboard SHALL display current speed readings from InfluxDB
3. WHEN press equipment is active THEN the dashboard SHALL display current pressure readings from InfluxDB
4. WHEN equipment metrics are updated THEN the dashboard SHALL refresh the displayed values within 5 seconds

### Requirement 5

**User Story:** As a production supervisor, I want to see accurate line efficiency calculations, so that I can assess overall production performance.

#### Acceptance Criteria

1. WHEN production line data is available in InfluxDB THEN the dashboard SHALL calculate and display line efficiency based on actual data
2. WHEN equipment on a line has errors THEN the line efficiency SHALL reflect the impact of those errors
3. WHEN all equipment on a line is stopped THEN the line efficiency SHALL show 0%
4. WHEN line efficiency is calculated THEN it SHALL be updated every 30 seconds based on the latest data

### Requirement 6

**User Story:** As a developer, I want the dashboard to automatically detect the deployment environment, so that it uses appropriate data sources for different deployment scenarios.

#### Acceptance Criteria

1. WHEN the dashboard is deployed on GitHub Pages THEN it SHALL automatically use fallback simulation data without attempting InfluxDB connection
2. WHEN the dashboard is deployed in Docker environment THEN it SHALL attempt to connect to InfluxDB and use real data
3. WHEN the deployment environment is detected THEN the appropriate data source SHALL be selected without manual configuration
4. WHEN running in GitHub Pages mode THEN the dashboard SHALL not display InfluxDB connection errors or warnings