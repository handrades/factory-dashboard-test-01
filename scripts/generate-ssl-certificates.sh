#!/bin/bash

# SSL Certificate Generation Script
# Generates self-signed certificates for development and provides production guidance

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CERT_DIR="./ssl"
DOMAIN="factory-dashboard.local"
COUNTRY="US"
STATE="CA"
CITY="San Francisco"
ORG="Factory Dashboard"
ORG_UNIT="IT Department"
EMAIL="admin@factory-dashboard.local"

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_status $BLUE "🔐 Factory Dashboard - SSL Certificate Generator"
print_status $BLUE "==============================================="

# Create SSL directory
mkdir -p "$CERT_DIR"

print_status $GREEN "📁 Created SSL directory: $CERT_DIR"

# Check if certificates already exist
if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    print_status $YELLOW "⚠️  SSL certificates already exist!"
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status $BLUE "ℹ️  Using existing certificates"
        exit 0
    fi
fi

print_status $GREEN "🔑 Generating SSL certificates..."

# Generate private key
print_status $BLUE "1. Generating private key..."
openssl genrsa -out "$CERT_DIR/server.key" 2048

# Set secure permissions on private key
chmod 600 "$CERT_DIR/server.key"

# Create certificate signing request configuration
cat > "$CERT_DIR/server.conf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=$COUNTRY
ST=$STATE
L=$CITY
O=$ORG
OU=$ORG_UNIT
emailAddress=$EMAIL
CN=$DOMAIN

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
DNS.3 = *.factory-dashboard.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Generate certificate signing request
print_status $BLUE "2. Generating certificate signing request..."
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" -config "$CERT_DIR/server.conf"

# Generate self-signed certificate
print_status $BLUE "3. Generating self-signed certificate..."
openssl x509 -req -in "$CERT_DIR/server.csr" -signkey "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days 365 -extensions v3_req -extfile "$CERT_DIR/server.conf"

# Generate certificate chain (for development, just copy the cert)
cp "$CERT_DIR/server.crt" "$CERT_DIR/server-chain.crt"

# Generate DH parameters for enhanced security
print_status $BLUE "4. Generating Diffie-Hellman parameters..."
openssl dhparam -out "$CERT_DIR/dhparam.pem" 2048

# Create certificate bundle
print_status $BLUE "5. Creating certificate bundle..."
cat "$CERT_DIR/server.crt" "$CERT_DIR/server.key" > "$CERT_DIR/server-bundle.pem"

# Set appropriate permissions
chmod 644 "$CERT_DIR/server.crt"
chmod 644 "$CERT_DIR/server-chain.crt"
chmod 644 "$CERT_DIR/dhparam.pem"
chmod 600 "$CERT_DIR/server.key"
chmod 600 "$CERT_DIR/server-bundle.pem"
chmod 644 "$CERT_DIR/server.csr"
chmod 644 "$CERT_DIR/server.conf"

print_status $GREEN "✅ SSL certificates generated successfully!"

# Display certificate information
print_status $YELLOW "📋 Certificate Information:"
openssl x509 -in "$CERT_DIR/server.crt" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:|IP Address:)"

print_status $BLUE "📁 Generated Files:"
echo "   - $CERT_DIR/server.key (Private Key)"
echo "   - $CERT_DIR/server.crt (Certificate)"
echo "   - $CERT_DIR/server-chain.crt (Certificate Chain)"
echo "   - $CERT_DIR/server-bundle.pem (Certificate Bundle)"
echo "   - $CERT_DIR/dhparam.pem (DH Parameters)"
echo "   - $CERT_DIR/server.csr (Certificate Signing Request)"

print_status $YELLOW "⚠️  Development Certificate Notice:"
echo "   - This is a self-signed certificate for development use only"
echo "   - Browsers will show security warnings for self-signed certificates"
echo "   - For production, use certificates from a trusted Certificate Authority"

print_status $BLUE "🔒 Security Recommendations:"
echo "   - Keep private keys secure and never commit them to version control"
echo "   - Use strong cipher suites in your web server configuration"
echo "   - Enable HTTP Strict Transport Security (HSTS)"
echo "   - Consider using Certificate Transparency monitoring"

print_status $GREEN "🚀 Next Steps:"
echo "   1. Update your web server configuration to use these certificates"
echo "   2. Test HTTPS connectivity"
echo "   3. Configure automatic certificate renewal for production"
echo "   4. Set up monitoring for certificate expiration"

# Create a simple verification script
cat > "$CERT_DIR/verify-certificate.sh" << 'EOF'
#!/bin/bash
# Certificate verification script

CERT_FILE="./server.crt"

if [ ! -f "$CERT_FILE" ]; then
    echo "Certificate file not found: $CERT_FILE"
    exit 1
fi

echo "🔍 Certificate Verification Results:"
echo "=================================="

# Check certificate validity
echo "📅 Certificate Validity:"
openssl x509 -in "$CERT_FILE" -noout -dates

# Check certificate details
echo -e "\n📋 Certificate Details:"
openssl x509 -in "$CERT_FILE" -noout -subject -issuer

# Check SAN (Subject Alternative Names)
echo -e "\n🌐 Subject Alternative Names:"
openssl x509 -in "$CERT_FILE" -noout -text | grep -A 5 "Subject Alternative Name" || echo "No SAN found"

# Check key usage
echo -e "\n🔑 Key Usage:"
openssl x509 -in "$CERT_FILE" -noout -text | grep -A 2 "Key Usage" || echo "No key usage found"

# Verify certificate and key match
if [ -f "./server.key" ]; then
    CERT_HASH=$(openssl x509 -in "$CERT_FILE" -noout -modulus | openssl md5)
    KEY_HASH=$(openssl rsa -in "./server.key" -noout -modulus | openssl md5)
    
    echo -e "\n🔐 Certificate and Key Match:"
    if [ "$CERT_HASH" = "$KEY_HASH" ]; then
        echo "✅ Certificate and private key match"
    else
        echo "❌ Certificate and private key do NOT match"
    fi
fi

# Check certificate expiration
EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( (EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))

echo -e "\n⏰ Certificate Expiration:"
if [ $DAYS_UNTIL_EXPIRY -gt 30 ]; then
    echo "✅ Certificate expires in $DAYS_UNTIL_EXPIRY days"
elif [ $DAYS_UNTIL_EXPIRY -gt 0 ]; then
    echo "⚠️  Certificate expires in $DAYS_UNTIL_EXPIRY days (renewal recommended)"
else
    echo "❌ Certificate has expired!"
fi
EOF

chmod +x "$CERT_DIR/verify-certificate.sh"

print_status $GREEN "🎉 SSL certificate generation complete!"
print_status $BLUE "💡 Run '$CERT_DIR/verify-certificate.sh' to verify your certificates anytime"