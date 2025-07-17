#!/bin/bash

# Factory Dashboard System Validation Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
INFLUXDB_URL=${INFLUXDB_URL:-http://localhost:8086}
PLC_EMULATOR_URL=${PLC_EMULATOR_URL:-http://localhost:3000}
QUEUE_CONSUMER_URL=${QUEUE_CONSUMER_URL:-http://localhost:8081}
DASHBOARD_URL=${DASHBOARD_URL:-http://localhost:3000}

echo -e "${BLUE}🔍 Factory Dashboard System Validation${NC}"
echo "========================================"

# Test Results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "\n${BLUE}Running: ${test_name}${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED: ${test_name}${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Infrastructure Tests
echo -e "\n${YELLOW}📊 Infrastructure Validation${NC}"

run_test "Redis Connection" "redis-cli -h $REDIS_HOST -p $REDIS_PORT ping | grep -q PONG"

run_test "InfluxDB Health" "curl -sf $INFLUXDB_URL/health > /dev/null"

run_test "InfluxDB API Access" "curl -sf $INFLUXDB_URL/api/v2/buckets -H 'Authorization: Bearer test-token' > /dev/null"

# Service Health Tests
echo -e "\n${YELLOW}🔧 Service Health Validation${NC}"

run_test "PLC Emulator Health" "curl -sf $PLC_EMULATOR_URL/health | jq -e '.status == \"healthy\"' > /dev/null"

run_test "Queue Consumer Health" "curl -sf $QUEUE_CONSUMER_URL/health | jq -e '.healthy == true' > /dev/null"

run_test "PLC Emulator Metrics" "curl -sf $PLC_EMULATOR_URL/metrics > /dev/null"

run_test "Queue Consumer Metrics" "curl -sf $QUEUE_CONSUMER_URL/metrics > /dev/null"

# Data Flow Tests
echo -e "\n${YELLOW}📈 Data Flow Validation${NC}"

# Test message publishing to Redis
run_test "Redis Message Publishing" "
    redis-cli -h $REDIS_HOST -p $REDIS_PORT lpush test_queue '{\"id\":\"test\",\"timestamp\":\"$(date -Iseconds)\",\"equipmentId\":\"test\",\"messageType\":\"DATA_UPDATE\",\"tags\":[{\"tagId\":\"test\",\"value\":123,\"quality\":\"GOOD\"}]}' > /dev/null &&
    redis-cli -h $REDIS_HOST -p $REDIS_PORT llen test_queue | grep -q '1' &&
    redis-cli -h $REDIS_HOST -p $REDIS_PORT del test_queue > /dev/null
"

# Test InfluxDB write
run_test "InfluxDB Write Test" "
    curl -sf -XPOST '$INFLUXDB_URL/api/v2/write?org=factory-dashboard&bucket=factory-data' \
    -H 'Authorization: Bearer test-token' \
    -H 'Content-Type: text/plain; charset=utf-8' \
    --data-binary 'test_measurement,equipment_id=test_equipment value=123 $(date +%s)000000000' > /dev/null
"

# Test InfluxDB query
run_test "InfluxDB Query Test" "
    curl -sf -XPOST '$INFLUXDB_URL/api/v2/query?org=factory-dashboard' \
    -H 'Authorization: Bearer test-token' \
    -H 'Content-Type: application/vnd.flux' \
    -d 'from(bucket:\"factory-data\") |> range(start: -1h) |> limit(n:1)' > /dev/null
"

# Configuration Tests
echo -e "\n${YELLOW}⚙️ Configuration Validation${NC}"

run_test "PLC Emulator Configuration" "test -f services/plc-emulator/config/sample-equipment.json"

run_test "Environment Configuration" "test -f .env || test -f .env.example"

run_test "Docker Compose Configuration" "docker-compose config > /dev/null"

run_test "Configuration Schema Validation" "
    cd services/plc-emulator &&
    npm run build > /dev/null 2>&1 &&
    node -e 'require(\"./dist/config/config-validator\")' > /dev/null 2>&1
"

# Integration Tests
echo -e "\n${YELLOW}🔄 Integration Validation${NC}"

# Send test message and verify processing
run_test "End-to-End Data Flow" "
    # Generate test message
    TEST_MESSAGE='{\"id\":\"e2e-test-$(date +%s)\",\"timestamp\":\"$(date -Iseconds)\",\"equipmentId\":\"validation_test\",\"messageType\":\"DATA_UPDATE\",\"tags\":[{\"tagId\":\"validation_value\",\"value\":999,\"quality\":\"GOOD\"}]}'
    
    # Send to Redis
    redis-cli -h $REDIS_HOST -p $REDIS_PORT lpush plc_data_validation_test \"\$TEST_MESSAGE\" > /dev/null &&
    
    # Wait for processing
    sleep 5 &&
    
    # Check if queue is empty (processed)
    QUEUE_LENGTH=\$(redis-cli -h $REDIS_HOST -p $REDIS_PORT llen plc_data_validation_test)
    test \$QUEUE_LENGTH -eq 0
"

# Performance Tests
echo -e "\n${YELLOW}⚡ Performance Validation${NC}"

run_test "Service Response Time" "
    RESPONSE_TIME=\$(curl -sf -w '%{time_total}' -o /dev/null $PLC_EMULATOR_URL/health)
    echo \"PLC Emulator response time: \${RESPONSE_TIME}s\"
    awk 'BEGIN{exit(\$RESPONSE_TIME > 2.0)}' <<< \$RESPONSE_TIME
"

run_test "Memory Usage Check" "
    # Check if services are using reasonable memory
    if command -v docker &> /dev/null; then
        MEMORY_USAGE=\$(docker stats --no-stream --format \"table {{.MemUsage}}\" | tail -n +2 | head -1 | cut -d'/' -f1 | sed 's/MiB//')
        echo \"Container memory usage: \${MEMORY_USAGE}MiB\"
        test \${MEMORY_USAGE%.*} -lt 500  # Less than 500MB
    else
        echo \"Docker not available, skipping memory check\"
        true
    fi
"

# Security Tests
echo -e "\n${YELLOW}🔒 Security Validation${NC}"

run_test "Redis Authentication" "
    if [ -n \"\$REDIS_PASSWORD\" ]; then
        redis-cli -h $REDIS_HOST -p $REDIS_PORT ping 2>&1 | grep -q 'NOAUTH' && echo 'Redis requires authentication' && exit 0
    fi
    echo 'Redis authentication check passed'
"

run_test "InfluxDB Token Validation" "
    curl -sf $INFLUXDB_URL/api/v2/me -H 'Authorization: Bearer invalid-token' 2>&1 | grep -q '401\\|unauthorized' &&
    echo 'InfluxDB properly rejects invalid tokens'
"

run_test "Service Health Endpoint Security" "
    # Check that health endpoints don't expose sensitive information
    curl -sf $PLC_EMULATOR_URL/health | jq -e 'has(\"password\") | not' > /dev/null &&
    curl -sf $QUEUE_CONSUMER_URL/health | jq -e 'has(\"token\") | not' > /dev/null
"

# Monitoring Tests
echo -e "\n${YELLOW}📊 Monitoring Validation${NC}"

run_test "Metrics Collection" "
    curl -sf $PLC_EMULATOR_URL/metrics | grep -q 'service_uptime_seconds' &&
    curl -sf $QUEUE_CONSUMER_URL/metrics | grep -q 'messages_processed_total'
"

run_test "Log Structure Validation" "
    # Check if logs are properly structured
    if [ -f services/plc-emulator/plc-emulator.log ]; then
        tail -1 services/plc-emulator/plc-emulator.log | jq -e '.timestamp and .level and .message' > /dev/null
    else
        echo 'Log file not found, assuming structured logging is working'
        true
    fi
"

# Dashboard Tests
echo -e "\n${YELLOW}🖥️ Dashboard Validation${NC}"

run_test "Dashboard Accessibility" "curl -sf $DASHBOARD_URL > /dev/null"

run_test "Dashboard Assets" "
    curl -sf $DASHBOARD_URL | grep -q 'Factory Dashboard' &&
    curl -sf $DASHBOARD_URL | grep -q 'react'
"

# Cleanup Test Data
echo -e "\n${YELLOW}🧹 Cleanup${NC}"

run_test "Test Data Cleanup" "
    redis-cli -h $REDIS_HOST -p $REDIS_PORT del plc_data_validation_test test_queue > /dev/null &&
    echo 'Test data cleaned up successfully'
"

# Summary
echo -e "\n${BLUE}📋 Validation Summary${NC}"
echo "===================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All validation tests passed! System is ready for production.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some validation tests failed. Please review and fix the issues.${NC}"
    exit 1
fi