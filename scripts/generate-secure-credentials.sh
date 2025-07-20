#!/bin/bash

# Secure Credential Generation Script
# This script generates strong, unique credentials for all services

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to generate a strong password
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Function to generate a secure token
generate_token() {
    local length=${1:-64}
    openssl rand -hex $length
}

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_status $BLUE "🔐 Factory Dashboard - Secure Credential Generator"
print_status $BLUE "=================================================="

# Check if .env already exists
if [ -f ".env" ]; then
    print_status $YELLOW "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status $RED "❌ Credential generation cancelled"
        exit 1
    fi
fi

print_status $GREEN "🔑 Generating secure credentials..."

# Generate strong credentials
REDIS_PASSWORD=$(generate_password 24)
INFLUXDB_PASSWORD=$(generate_password 24)
INFLUXDB_TOKEN=$(generate_token 32)
GRAFANA_PASSWORD=$(generate_password 24)
JWT_SECRET=$(generate_token 32)
JWT_REFRESH_SECRET=$(generate_token 32)

# Create .env file with secure credentials
cat > .env << EOF
# Factory Dashboard - Secure Configuration
# Generated on: $(date)
# WARNING: Keep this file secure and never commit to version control

# Redis Configuration
REDIS_PASSWORD=${REDIS_PASSWORD}

# InfluxDB Configuration
INFLUXDB_USERNAME=admin
INFLUXDB_PASSWORD=${INFLUXDB_PASSWORD}
INFLUXDB_ORG=factory-dashboard
INFLUXDB_BUCKET=factory-data
INFLUXDB_TOKEN=${INFLUXDB_TOKEN}

# Grafana Configuration
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}

# Authentication Configuration
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# Service Configuration
LOG_LEVEL=info
PLC_UPDATE_INTERVAL=1000
BATCH_SIZE=10
MAX_RETRIES=3

# Security Configuration
ENABLE_AUTHENTICATION=true
SESSION_TIMEOUT=3600
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION=900

# Network Security
ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000
RATE_LIMIT_WINDOW=900
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Set secure permissions on .env file
chmod 600 .env

print_status $GREEN "✅ Secure credentials generated successfully!"
print_status $YELLOW "📋 Credential Summary:"
echo "   - Redis Password: ${REDIS_PASSWORD:0:8}... (24 chars)"
echo "   - InfluxDB Password: ${INFLUXDB_PASSWORD:0:8}... (24 chars)"
echo "   - InfluxDB Token: ${INFLUXDB_TOKEN:0:16}... (64 chars)"
echo "   - Grafana Password: ${GRAFANA_PASSWORD:0:8}... (24 chars)"
echo "   - JWT Secret: ${JWT_SECRET:0:16}... (64 chars)"

print_status $BLUE "🔒 Security Notes:"
echo "   - .env file permissions set to 600 (owner read/write only)"
echo "   - All passwords are 24+ characters with high entropy"
echo "   - Tokens are cryptographically secure random values"
echo "   - Never commit .env file to version control"

print_status $GREEN "🚀 Next Steps:"
echo "   1. Review the generated .env file"
echo "   2. Update any existing services with new credentials"
echo "   3. Test the system with new credentials"
echo "   4. Securely backup credentials for production use"

# Create backup of credentials (encrypted)
if command -v gpg &> /dev/null; then
    print_status $BLUE "🔐 Creating encrypted backup..."
    gpg --symmetric --cipher-algo AES256 --output .env.backup.gpg .env 2>/dev/null || true
    if [ -f ".env.backup.gpg" ]; then
        print_status $GREEN "✅ Encrypted backup created: .env.backup.gpg"
    fi
fi

print_status $GREEN "🎉 Credential generation complete!"