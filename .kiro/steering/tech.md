# Technical Stack & Development Guidelines

## Frontend Technologies
- **Framework**: React 19.x with TypeScript 5.8.x
- **Build Tool**: Vite 7.x
- **Animation Library**: GSAP (GreenSock Animation Platform) 3.13.x
- **Routing**: React Router DOM 7.6.x
- **State Management**: React Context API (no Redux)
- **Styling**: CSS Modules with native CSS3 animations

## Backend Services
- **PLC Emulator**: Node.js TypeScript service that simulates industrial equipment
- **Queue Consumer**: Node.js TypeScript service that processes equipment data
- **Shared Types**: Common TypeScript definitions used across services

## Data Storage
- **Time Series Database**: InfluxDB 2.7 for equipment metrics and historical data
- **Message Queue**: Redis 7.x for inter-service communication

## Infrastructure
- **Containerization**: Docker with docker-compose for local development
- **Monitoring**: Grafana dashboards for system metrics
- **Configuration**: Environment variables with .env files

## Common Commands

### Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

### Docker
```bash
# Start all services with Docker Compose
docker compose up --build -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Run tests in Docker
docker compose -f docker-compose.test.yml up --build
```

### Services
```bash
# Start PLC emulator service locally
cd services/plc-emulator
npm run dev

# Start queue consumer service locally
cd services/queue-consumer
npm run dev
```

## Code Style Guidelines
- Use TypeScript for all new code
- Follow ESLint configuration in config/eslint.config.js
- Use functional components with hooks for React
- Prefer async/await over Promise chains
- Use named exports over default exports when possible
- Follow the existing project structure for new files
- Use GSAP for complex animations, CSS for simple ones