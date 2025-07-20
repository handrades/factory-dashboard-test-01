# Implementation Plan

- [X] 1. Create environment detection service
  - Implement EnvironmentDetectionService class to automatically detect GitHub Pages vs Docker deployment
  - Add logic to determine appropriate data source based on environment variables and runtime context
  - Create configuration interfaces for different deployment scenarios
  - _Requirements: 6.1, 6.3_

- [X] 2. Fix Docker InfluxDB connection configuration
  - Update docker-compose.yml to use correct InfluxDB service URL (influxdb:8086 instead of localhost:8086)
  - Verify environment variable propagation in Docker containers
  - Test InfluxDB connectivity from dashboard container
  - _Requirements: 1.1, 1.4_

- [X] 3. Enhance InfluxDB service with retry logic
  - Add connection retry mechanism with exponential backoff to InfluxDBService
  - Implement connection diagnostics and health monitoring
  - Add better error categorization for different failure types
  - _Requirements: 3.1, 3.3_

- [X] 4. Implement data source manager
  - Create DataSourceManager class to handle switching between InfluxDB and simulation data
  - Add logic to automatically switch data sources based on connection status
  - Implement consistent data interface regardless of source
  - _Requirements: 3.1, 3.2_

- [X] 5. Update factory context for environment-aware initialization
  - Modify FactoryProvider to use environment detection for data source selection
  - Add GitHub Pages mode that skips InfluxDB connection attempts
  - Implement proper error handling that doesn't show connection errors in GitHub Pages mode
  - _Requirements: 6.1, 6.4_

- [x] 6. Improve data mapping and transformation
  - Enhance transformToEquipmentInterface method to handle actual InfluxDB data structure
  - Add validation for expected InfluxDB measurements and fields
  - Implement proper status determination logic based on equipment data freshness
  - _Requirements: 2.1, 2.2, 2.3_

- [X] 7. Add real-time equipment metrics display
  - Update equipment components to display live temperature, speed, and pressure data
  - Implement data refresh mechanism that updates metrics every 5 seconds
  - Add visual indicators for data freshness and connection status
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [X] 8. Implement line efficiency calculations from real data
  - Update line efficiency calculation to use actual InfluxDB quality metrics
  - Add logic to calculate efficiency based on equipment error states
  - Implement 30-second refresh cycle for efficiency metrics
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [X] 9. Add connection status indicators
  - Create visual connection status component showing InfluxDB connection state
  - Add indicators to distinguish between real data and simulation mode
  - Implement user-friendly error messages for connection issues
  - _Requirements: 1.4, 3.4_

- [X] 10. Update build configuration for environment variables
  - Modify GitHub Pages workflow to set appropriate environment variables
  - Update Vite configuration to handle different deployment environments
  - Add environment-specific build optimizations
  - _Requirements: 6.1, 6.2, 6.3_

- [X] 11. Create comprehensive tests for data integration
  - Write unit tests for EnvironmentDetectionService and DataSourceManager
  - Add integration tests for InfluxDB connection and data transformation
  - Create tests for fallback behavior and error handling scenarios
  - _Requirements: 1.1, 2.1, 3.1, 3.2_

- [X] 12. Add logging and monitoring for production debugging
  - Implement structured logging for connection attempts and data retrieval
  - Add performance metrics for data refresh cycles
  - Create diagnostic endpoints for troubleshooting connection issues
  - _Requirements: 3.3_

- [x] 13. Fix static temperature display issue
  - Investigate why Line 6 oven shows static 352.98°C despite changing InfluxDB data
  - Reduce cache timeout from 30s to 0s (disabled) for real-time updates
  - Add aggressive cache clearing and data refresh mechanisms
  - Implement visual indicators for data freshness and debugging
  - _Requirements: 1.3, 4.4_