# Project Structure

## Root Organization
- `/src`: Frontend application code
- `/services`: Backend microservices
- `/config`: Build and TypeScript configuration
- `/docker`: Docker and deployment configuration
- `/infrastructure`: System configuration files
- `/monitoring`: Monitoring and observability setup
- `/docs`: Project documentation
- `/tests`: Test suites and utilities
- `/public`: Static assets for the frontend

## Frontend Structure (`/src`)
- `/components`: Reusable UI components
  - `/Equipment`: Equipment visualization components
- `/context`: React context providers for state management
- `/pages`: Page-level components (Dashboard, LineDetail)
- `/services`: Frontend service clients
- `/utils`: Utility functions and helpers
- `/assets`: Static assets (images, icons)

## Backend Services (`/services`)
- `/plc-emulator`: Service that simulates PLC equipment data
  - `/src`: Source code
  - `/config`: Service-specific configuration
- `/queue-consumer`: Service that processes and stores equipment data
  - `/src`: Source code
- `/shared-types`: Common TypeScript definitions used across services

## Configuration (`/config`)
- `vite.config.ts`: Vite build configuration
- `tsconfig.json`: TypeScript configuration
- `eslint.config.js`: ESLint rules

## Infrastructure (`/infrastructure`)
- `/config`: Production line configuration files

## Monitoring (`/monitoring`)
- `/grafana`: Grafana dashboards and configuration
- `/alerts`: Alert rules and notification channels

## Docker Configuration
- `/docker`: Main Docker configuration
  - `Dockerfile`: Frontend application container
  - `docker-compose.yml`: Multi-container setup
- Service-specific Dockerfiles in respective service directories

## Key Files
- `package.json`: Project dependencies and scripts
- `.env`: Environment variables (gitignored)
- `.env.example`: Example environment variables
- `docker-compose.yml`: Main Docker Compose configuration
- `docker-compose.test.yml`: Test environment configuration

## Naming Conventions
- React components: PascalCase (e.g., `IndustrialOven.tsx`)
- Utility functions: camelCase (e.g., `configLoader.ts`)
- CSS files: Match component name (e.g., `IndustrialOven.css`)
- Test files: `*.test.ts` or in `__tests__` directory
- Configuration files: kebab-case (e.g., `line-config-loader.ts`)