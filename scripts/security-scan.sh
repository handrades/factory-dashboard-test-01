#!/bin/bash

# Comprehensive Security Scanning Script
# This script performs security scans on the factory dashboard application

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}🔒 Factory Dashboard Security Scanner${NC}"
echo -e "${BLUE}======================================${NC}"
echo "Timestamp: $(date)"
echo "Project Root: $PROJECT_ROOT"
echo "Report Directory: $REPORT_DIR"
echo ""

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}🔍 $1${NC}"
    echo "----------------------------------------"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. NPM Audit - Check for known vulnerabilities
print_section "NPM Dependency Audit"
if command_exists npm; then
    cd "$PROJECT_ROOT"
    
    echo "Running npm audit..."
    if npm audit --json > "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null; then
        print_success "NPM audit completed"
        
        # Parse results
        VULNERABILITIES=$(jq -r '.metadata.vulnerabilities | to_entries[] | "\(.key): \(.value)"' "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null || echo "No vulnerabilities data")
        echo "Vulnerabilities found: $VULNERABILITIES"
        
        # Check for high/critical vulnerabilities
        HIGH_CRITICAL=$(jq -r '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null || echo "0")
        if [ "$HIGH_CRITICAL" -gt 0 ]; then
            print_error "Found $HIGH_CRITICAL high/critical vulnerabilities"
        else
            print_success "No high/critical vulnerabilities found"
        fi
        
        # Generate human-readable report
        npm audit > "$REPORT_DIR/npm-audit-readable-$TIMESTAMP.txt" 2>/dev/null || true
    else
        print_warning "NPM audit failed or no package.json found"
    fi
    
    # Check service directories
    for service_dir in services/*/; do
        if [ -f "$service_dir/package.json" ]; then
            service_name=$(basename "$service_dir")
            echo "Checking service: $service_name"
            cd "$PROJECT_ROOT/$service_dir"
            
            if npm audit --json > "$REPORT_DIR/npm-audit-$service_name-$TIMESTAMP.json" 2>/dev/null; then
                print_success "Service $service_name audit completed"
            else
                print_warning "Service $service_name audit failed"
            fi
        fi
    done
    
    cd "$PROJECT_ROOT"
else
    print_warning "npm not found, skipping dependency audit"
fi

# 2. Docker Security Scanning
print_section "Docker Security Scanning"
if command_exists docker; then
    echo "Scanning Docker images for vulnerabilities..."
    
    # Get list of images used in the project
    IMAGES=$(docker-compose config | grep "image:" | awk '{print $2}' | sort -u)
    
    for image in $IMAGES; do
        echo "Scanning image: $image"
        
        # Use docker scout if available (Docker Desktop)
        if command_exists docker && docker scout version >/dev/null 2>&1; then
            docker scout cves "$image" --format json > "$REPORT_DIR/docker-scout-${image//[\/:]/-}-$TIMESTAMP.json" 2>/dev/null || print_warning "Docker scout scan failed for $image"
        fi
        
        # Use trivy if available
        if command_exists trivy; then
            trivy image --format json --output "$REPORT_DIR/trivy-${image//[\/:]/-}-$TIMESTAMP.json" "$image" 2>/dev/null || print_warning "Trivy scan failed for $image"
        fi
    done
    
    print_success "Docker image scanning completed"
else
    print_warning "Docker not found, skipping container scanning"
fi

# 3. Secrets Detection
print_section "Secrets Detection"
echo "Scanning for exposed secrets and credentials..."

# Simple grep-based secret detection
SECRET_PATTERNS=(
    "password\s*=\s*['\"][^'\"]*['\"]"
    "api[_-]?key\s*=\s*['\"][^'\"]*['\"]"
    "secret\s*=\s*['\"][^'\"]*['\"]"
    "token\s*=\s*['\"][^'\"]*['\"]"
    "aws[_-]?access[_-]?key"
    "aws[_-]?secret[_-]?key"
    "AKIA[0-9A-Z]{16}"
    "sk-[a-zA-Z0-9]{48}"
    "rsa[_-]?private[_-]?key"
    "ssh[_-]?private[_-]?key"
)

SECRET_FINDINGS="$REPORT_DIR/secrets-scan-$TIMESTAMP.txt"
echo "Secret Detection Report - $(date)" > "$SECRET_FINDINGS"
echo "=================================" >> "$SECRET_FINDINGS"

found_secrets=false
for pattern in "${SECRET_PATTERNS[@]}"; do
    echo "Checking pattern: $pattern" >> "$SECRET_FINDINGS"
    
    # Search in source files, excluding node_modules and .git
    if grep -r -i -E "$pattern" "$PROJECT_ROOT" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude-dir=dist \
        --exclude-dir=build \
        --exclude="*.log" \
        --exclude="*.lock" >> "$SECRET_FINDINGS" 2>/dev/null; then
        found_secrets=true
    fi
    echo "" >> "$SECRET_FINDINGS"
done

if [ "$found_secrets" = true ]; then
    print_error "Potential secrets found - check $SECRET_FINDINGS"
else
    print_success "No obvious secrets detected"
fi

# 4. File Permissions Check
print_section "File Permissions Check"
echo "Checking for overly permissive file permissions..."

PERMISSIONS_REPORT="$REPORT_DIR/file-permissions-$TIMESTAMP.txt"
echo "File Permissions Report - $(date)" > "$PERMISSIONS_REPORT"
echo "===================================" >> "$PERMISSIONS_REPORT"

# Check for world-writable files
echo "World-writable files:" >> "$PERMISSIONS_REPORT"
find "$PROJECT_ROOT" -type f -perm -002 -not -path "*/node_modules/*" -not -path "*/.git/*" >> "$PERMISSIONS_REPORT" 2>/dev/null || true

# Check for SUID/SGID files
echo -e "\nSUID/SGID files:" >> "$PERMISSIONS_REPORT"
find "$PROJECT_ROOT" -type f \( -perm -4000 -o -perm -2000 \) -not -path "*/node_modules/*" -not -path "*/.git/*" >> "$PERMISSIONS_REPORT" 2>/dev/null || true

# Check for files with no owner
echo -e "\nFiles with no owner:" >> "$PERMISSIONS_REPORT"
find "$PROJECT_ROOT" -nouser -o -nogroup -not -path "*/node_modules/*" -not -path "*/.git/*" >> "$PERMISSIONS_REPORT" 2>/dev/null || true

print_success "File permissions check completed"

# 5. Configuration Security Check
print_section "Configuration Security Check"
echo "Checking configuration files for security issues..."

CONFIG_REPORT="$REPORT_DIR/config-security-$TIMESTAMP.txt"
echo "Configuration Security Report - $(date)" > "$CONFIG_REPORT"
echo "=======================================" >> "$CONFIG_REPORT"

# Check Docker Compose for security issues
if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "Docker Compose Security Check:" >> "$CONFIG_REPORT"
    
    # Check for privileged containers
    if grep -q "privileged.*true" "$PROJECT_ROOT/docker-compose.yml"; then
        echo "❌ Found privileged containers" >> "$CONFIG_REPORT"
    else
        echo "✅ No privileged containers found" >> "$CONFIG_REPORT"
    fi
    
    # Check for host network mode
    if grep -q "network_mode.*host" "$PROJECT_ROOT/docker-compose.yml"; then
        echo "❌ Found host network mode" >> "$CONFIG_REPORT"
    else
        echo "✅ No host network mode found" >> "$CONFIG_REPORT"
    fi
    
    # Check for volume mounts to sensitive directories
    if grep -q "/etc\|/var/run/docker.sock\|/proc\|/sys" "$PROJECT_ROOT/docker-compose.yml"; then
        echo "⚠️  Found potentially sensitive volume mounts" >> "$CONFIG_REPORT"
    else
        echo "✅ No sensitive volume mounts found" >> "$CONFIG_REPORT"
    fi
fi

# Check nginx configuration
if [ -f "$PROJECT_ROOT/nginx/nginx.conf" ]; then
    echo -e "\nNginx Security Check:" >> "$CONFIG_REPORT"
    
    # Check for SSL configuration
    if grep -q "ssl_" "$PROJECT_ROOT/nginx/nginx.conf"; then
        echo "✅ SSL configuration found" >> "$CONFIG_REPORT"
    else
        echo "⚠️  No SSL configuration found" >> "$CONFIG_REPORT"
    fi
    
    # Check for security headers
    if grep -q "X-Frame-Options\|X-Content-Type-Options\|X-XSS-Protection" "$PROJECT_ROOT/nginx/nginx.conf"; then
        echo "✅ Security headers configured" >> "$CONFIG_REPORT"
    else
        echo "⚠️  Security headers not found" >> "$CONFIG_REPORT"
    fi
fi

print_success "Configuration security check completed"

# 6. Port and Service Enumeration
print_section "Port and Service Enumeration"
echo "Checking for exposed ports and services..."

PORTS_REPORT="$REPORT_DIR/ports-services-$TIMESTAMP.txt"
echo "Ports and Services Report - $(date)" > "$PORTS_REPORT"
echo "====================================" >> "$PORTS_REPORT"

# Check Docker Compose exposed ports
if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "Exposed ports from Docker Compose:" >> "$PORTS_REPORT"
    grep -E "^\s*-\s*\"?[0-9]+:" "$PROJECT_ROOT/docker-compose.yml" >> "$PORTS_REPORT" 2>/dev/null || true
fi

# Check for running services on common ports
if command_exists netstat; then
    echo -e "\nListening services:" >> "$PORTS_REPORT"
    netstat -tlnp 2>/dev/null | grep LISTEN >> "$PORTS_REPORT" || true
elif command_exists ss; then
    echo -e "\nListening services:" >> "$PORTS_REPORT"
    ss -tlnp 2>/dev/null | grep LISTEN >> "$PORTS_REPORT" || true
fi

print_success "Port enumeration completed"

# 7. SSL/TLS Configuration Check
print_section "SSL/TLS Configuration Check"
if command_exists openssl; then
    echo "Checking SSL certificate configuration..."
    
    SSL_REPORT="$REPORT_DIR/ssl-config-$TIMESTAMP.txt"
    echo "SSL Configuration Report - $(date)" > "$SSL_REPORT"
    echo "=================================" >> "$SSL_REPORT"
    
    # Check self-signed certificate if it exists
    if [ -f "$PROJECT_ROOT/nginx/ssl/nginx-selfsigned.crt" ]; then
        echo "Certificate Details:" >> "$SSL_REPORT"
        openssl x509 -in "$PROJECT_ROOT/nginx/ssl/nginx-selfsigned.crt" -text -noout >> "$SSL_REPORT" 2>/dev/null || true
    fi
    
    print_success "SSL configuration check completed"
else
    print_warning "OpenSSL not found, skipping SSL checks"
fi

# 8. Environment Variables Check
print_section "Environment Variables Check"
echo "Checking for sensitive environment variables..."

ENV_REPORT="$REPORT_DIR/env-variables-$TIMESTAMP.txt"
echo "Environment Variables Report - $(date)" > "$ENV_REPORT"
echo "=======================================" >> "$ENV_REPORT"

# Check .env files for sensitive data
find "$PROJECT_ROOT" -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*" | while read -r env_file; do
    echo "Checking: $env_file" >> "$ENV_REPORT"
    
    # Look for unquoted sensitive values
    if grep -E "(PASSWORD|SECRET|KEY|TOKEN).*=" "$env_file" | grep -v '""' >> "$ENV_REPORT" 2>/dev/null; then
        echo "⚠️  Found sensitive variables in $env_file" >> "$ENV_REPORT"
    fi
    echo "" >> "$ENV_REPORT"
done

print_success "Environment variables check completed"

# 9. Generate Summary Report
print_section "Generating Summary Report"
SUMMARY_REPORT="$REPORT_DIR/security-summary-$TIMESTAMP.txt"

cat > "$SUMMARY_REPORT" << EOF
Factory Dashboard Security Scan Summary
======================================
Scan Date: $(date)
Scan ID: $TIMESTAMP

Files Generated:
$(ls -la "$REPORT_DIR"/*$TIMESTAMP* 2>/dev/null | awk '{print $9}' | xargs -I {} basename {} || echo "No files generated")

Recommendations:
1. Review npm audit results and update vulnerable dependencies
2. Scan Docker images with updated security tools
3. Ensure no secrets are committed to version control
4. Verify file permissions are properly set
5. Review configuration files for security best practices
6. Monitor exposed ports and services
7. Implement proper SSL/TLS configuration for production
8. Secure environment variable handling

Next Steps:
- Address any high/critical vulnerabilities found
- Implement continuous security scanning in CI/CD
- Set up security monitoring and alerting
- Regular security reviews and penetration testing

For detailed results, check the individual report files in:
$REPORT_DIR
EOF

print_success "Summary report generated: $SUMMARY_REPORT"

# 10. Final Report
echo ""
print_section "Security Scan Complete"
echo "Reports saved to: $REPORT_DIR"
echo "Summary available in: $SUMMARY_REPORT"
echo ""
echo "Quick Actions:"
echo "1. Review npm vulnerabilities: npm audit"
echo "2. Update dependencies: npm update"
echo "3. Check Docker security: docker scout quickview"
echo "4. Review configuration: Check $CONFIG_REPORT"
echo ""

# Exit with error code if critical issues found
if [ -f "$REPORT_DIR/npm-audit-$TIMESTAMP.json" ]; then
    HIGH_CRITICAL=$(jq -r '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null || echo "0")
    if [ "$HIGH_CRITICAL" -gt 0 ]; then
        print_error "Critical security issues found - manual review required"
        exit 1
    fi
fi

print_success "Security scan completed successfully"
exit 0