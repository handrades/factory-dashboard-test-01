#!/bin/bash

# Factory Dashboard Startup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏭 Factory Dashboard Startup Script${NC}"
echo "======================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file from template. Please review and update the configuration.${NC}"
fi

# Create necessary directories
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p monitoring/grafana/dashboards
mkdir -p monitoring/grafana/provisioning/dashboards
mkdir -p monitoring/grafana/provisioning/datasources
mkdir -p services/plc-emulator/config
mkdir -p services/queue-consumer/config

# Build shared types
echo -e "${BLUE}🔧 Building shared types...${NC}"
cd services/shared-types
npm install
npm run build
cd ../..

# Build services
echo -e "${BLUE}🔧 Building PLC Emulator...${NC}"
cd services/plc-emulator
npm install
npm run build
cd ../..

echo -e "${BLUE}🔧 Building Queue Consumer...${NC}"
cd services/queue-consumer
npm install
npm run build
cd ../..

# Build dashboard
echo -e "${BLUE}🔧 Building Dashboard...${NC}"
npm install
npm run build

# Start services
echo -e "${BLUE}🚀 Starting services...${NC}"
docker-compose up --build -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 30

# Check service health
echo -e "${BLUE}🔍 Checking service health...${NC}"

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is healthy${NC}"
else
    echo -e "${RED}❌ Redis is not responding${NC}"
fi

# Check InfluxDB
if curl -s http://localhost:8086/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ InfluxDB is healthy${NC}"
else
    echo -e "${RED}❌ InfluxDB is not responding${NC}"
fi

# Check Queue Consumer
if curl -s http://localhost:8081/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Queue Consumer is healthy${NC}"
else
    echo -e "${RED}❌ Queue Consumer is not responding${NC}"
fi

# Check Dashboard
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Dashboard is healthy${NC}"
else
    echo -e "${RED}❌ Dashboard is not responding${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Factory Dashboard is starting up!${NC}"
echo ""
echo "📊 Access the services:"
echo "  Dashboard:        http://localhost:3000"
echo "  Grafana:          http://localhost:3001 (admin/factory123)"
echo "  Redis Commander:  http://localhost:8082"
echo "  Queue Consumer:   http://localhost:8081/health"
echo "  InfluxDB:         http://localhost:8086"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker-compose logs -f"
echo "  Stop services:    docker-compose down"
echo "  Restart:          docker-compose restart"
echo "  View status:      docker-compose ps"
echo ""
echo -e "${YELLOW}📖 Check the README.md for more information${NC}"