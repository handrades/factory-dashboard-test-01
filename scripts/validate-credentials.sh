#!/bin/bash

# Credential Validation Script
# Validates that all required credentials are properly configured

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if a variable is set and not empty
check_variable() {
    local var_name=$1
    local var_value="${!var_name:-}"
    local is_secret=${2:-false}
    
    if [ -z "$var_value" ]; then
        print_status $RED "❌ $var_name is not set or empty"
        return 1
    else
        if [ "$is_secret" = "true" ]; then
            local masked_value="${var_value:0:4}***"
            print_status $GREEN "✅ $var_name is configured (${masked_value})"
        else
            print_status $GREEN "✅ $var_name is configured ($var_value)"
        fi
        return 0
    fi
}

# Function to validate password strength
validate_password_strength() {
    local password=$1
    local min_length=12
    
    if [ ${#password} -lt $min_length ]; then
        return 1
    fi
    
    # Check for at least one number, one uppercase, one lowercase
    if [[ "$password" =~ [0-9] ]] && [[ "$password" =~ [A-Z] ]] && [[ "$password" =~ [a-z] ]]; then
        return 0
    else
        return 1
    fi
}

print_status $BLUE "🔐 Factory Dashboard - Credential Validation"
print_status $BLUE "============================================="

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_status $RED "❌ .env file not found!"
    print_status $YELLOW "💡 Run './scripts/generate-secure-credentials.sh' to create secure credentials"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

print_status $BLUE "🔍 Validating required credentials..."

# Track validation results
VALIDATION_ERRORS=0

# Validate Redis credentials
print_status $YELLOW "📊 Redis Configuration:"
check_variable "REDIS_PASSWORD" true || ((VALIDATION_ERRORS++))

# Validate InfluxDB credentials
print_status $YELLOW "📈 InfluxDB Configuration:"
check_variable "INFLUXDB_USERNAME" false || ((VALIDATION_ERRORS++))
check_variable "INFLUXDB_PASSWORD" true || ((VALIDATION_ERRORS++))
check_variable "INFLUXDB_ORG" false || ((VALIDATION_ERRORS++))
check_variable "INFLUXDB_BUCKET" false || ((VALIDATION_ERRORS++))
check_variable "INFLUXDB_TOKEN" true || ((VALIDATION_ERRORS++))

# Validate Grafana credentials
print_status $YELLOW "📊 Grafana Configuration:"
check_variable "GRAFANA_PASSWORD" true || ((VALIDATION_ERRORS++))

# Validate Authentication credentials
print_status $YELLOW "🔐 Authentication Configuration:"
check_variable "JWT_SECRET" true || ((VALIDATION_ERRORS++))
check_variable "JWT_REFRESH_SECRET" true || ((VALIDATION_ERRORS++))

# Validate Security Configuration
print_status $YELLOW "🛡️  Security Configuration:"
check_variable "ENABLE_AUTHENTICATION" false || ((VALIDATION_ERRORS++))
check_variable "SESSION_TIMEOUT" false || ((VALIDATION_ERRORS++))
check_variable "MAX_FAILED_ATTEMPTS" false || ((VALIDATION_ERRORS++))
check_variable "LOCKOUT_DURATION" false || ((VALIDATION_ERRORS++))
check_variable "ALLOWED_ORIGINS" false || ((VALIDATION_ERRORS++))
check_variable "RATE_LIMIT_WINDOW" false || ((VALIDATION_ERRORS++))
check_variable "RATE_LIMIT_MAX_REQUESTS" false || ((VALIDATION_ERRORS++))

print_status $BLUE "🔒 Validating password strength..."

# Validate password strength
WEAK_PASSWORDS=0

if ! validate_password_strength "$REDIS_PASSWORD"; then
    print_status $YELLOW "⚠️  Redis password could be stronger (recommend 12+ chars with mixed case and numbers)"
    ((WEAK_PASSWORDS++))
fi

if ! validate_password_strength "$INFLUXDB_PASSWORD"; then
    print_status $YELLOW "⚠️  InfluxDB password could be stronger (recommend 12+ chars with mixed case and numbers)"
    ((WEAK_PASSWORDS++))
fi

if ! validate_password_strength "$GRAFANA_PASSWORD"; then
    print_status $YELLOW "⚠️  Grafana password could be stronger (recommend 12+ chars with mixed case and numbers)"
    ((WEAK_PASSWORDS++))
fi

# Validate token lengths
if [ ${#JWT_SECRET} -lt 32 ]; then
    print_status $YELLOW "⚠️  JWT Secret should be at least 32 characters"
    ((WEAK_PASSWORDS++))
fi

if [ ${#JWT_REFRESH_SECRET} -lt 32 ]; then
    print_status $YELLOW "⚠️  JWT Refresh Secret should be at least 32 characters"
    ((WEAK_PASSWORDS++))
fi

if [ ${#INFLUXDB_TOKEN} -lt 32 ]; then
    print_status $YELLOW "⚠️  InfluxDB Token should be at least 32 characters"
    ((WEAK_PASSWORDS++))
fi

print_status $BLUE "📋 Validation Summary:"
echo "   - Required credentials: $(($(grep -c "check_variable" "$0") - VALIDATION_ERRORS)) / $(grep -c "check_variable" "$0") configured"
echo "   - Password strength warnings: $WEAK_PASSWORDS"

if [ $VALIDATION_ERRORS -eq 0 ]; then
    print_status $GREEN "🎉 All required credentials are configured!"
    
    if [ $WEAK_PASSWORDS -eq 0 ]; then
        print_status $GREEN "🔒 All credentials meet security requirements!"
        exit 0
    else
        print_status $YELLOW "⚠️  Some credentials could be stronger, but system is functional"
        exit 0
    fi
else
    print_status $RED "❌ $VALIDATION_ERRORS required credentials are missing!"
    print_status $YELLOW "💡 Run './scripts/generate-secure-credentials.sh' to generate missing credentials"
    exit 1
fi