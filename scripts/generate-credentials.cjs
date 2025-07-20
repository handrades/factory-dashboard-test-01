#!/usr/bin/env node

const SecretManager = require('../src/security/SecretManager.cjs');
const fs = require('fs');
const path = require('path');

function generateStrongCredentials() {
  const secretManager = new SecretManager();
  
  console.log('🔐 Generating strong credentials...\n');

  const credentials = {
    REDIS_PASSWORD: secretManager.generateSecurePassword(24),
    INFLUXDB_USERNAME: 'admin',
    INFLUXDB_PASSWORD: secretManager.generateSecurePassword(24),
    INFLUXDB_ORG: 'factory-dashboard',
    INFLUXDB_BUCKET: 'factory-data',
    INFLUXDB_TOKEN: secretManager.generateToken(32),
    LOG_LEVEL: 'info',
    PLC_UPDATE_INTERVAL: '1000',
    BATCH_SIZE: '10',
    MAX_RETRIES: '3'
  };

  // Generate .env file content
  const envContent = Object.entries(credentials)
    .map(([key, value]) => {
      if (key.includes('PASSWORD') || key.includes('TOKEN')) {
        console.log(`✅ Generated ${key}: ${secretManager.maskSecret(value)}`);
      } else {
        console.log(`📝 Set ${key}: ${value}`);
      }
      
      // Add comments for credential sections
      let comment = '';
      if (key === 'REDIS_PASSWORD') {
        comment = '# Redis Configuration\n';
      } else if (key === 'INFLUXDB_USERNAME') {
        comment = '\n# InfluxDB Configuration\n';
      } else if (key === 'LOG_LEVEL') {
        comment = '\n# Service Configuration\n';
      }
      
      return `${comment}${key}=${value}`;
    })
    .join('\n');

  // Write to .env file
  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent + '\n');
  
  console.log(`\n✅ New credentials written to ${envPath}`);
  console.log('⚠️  Make sure to update your Docker containers with the new credentials');
  console.log('⚠️  Remember to back up these credentials securely');

  return credentials;
}

function updateDockerCompose(credentials) {
  const dockerComposePath = path.join(process.cwd(), 'docker-compose.yml');
  
  if (fs.existsSync(dockerComposePath)) {
    console.log('\n📝 Found docker-compose.yml - you may need to update it with new credentials');
    console.log('   Consider using environment variable substitution instead of hardcoded values');
  }
}

function createBackupScript() {
  const backupScript = `#!/bin/bash
# Backup script for credentials
# Store this in a secure location separate from the code repository

BACKUP_DIR="$HOME/.factory-dashboard-backups"
mkdir -p "$BACKUP_DIR"

# Backup with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
cp .env "$BACKUP_DIR/.env_backup_$TIMESTAMP"

echo "Credentials backed up to $BACKUP_DIR/.env_backup_$TIMESTAMP"
echo "Remember to encrypt this backup file!"
`;

  fs.writeFileSync('./backup-credentials.sh', backupScript);
  fs.chmodSync('./backup-credentials.sh', 0o755);
  
  console.log('\n📦 Created backup-credentials.sh script');
}

if (require.main === module) {
  try {
    const credentials = generateStrongCredentials();
    updateDockerCompose(credentials);
    createBackupScript();
    
    console.log('\n🎉 Credential generation complete!');
    console.log('\nNext steps:');
    console.log('1. Review the generated .env file');
    console.log('2. Update your Docker containers: docker-compose down && docker-compose up -d');
    console.log('3. Run ./backup-credentials.sh to create a secure backup');
    console.log('4. Store the backup in a secure location (encrypted)');
    
  } catch (error) {
    console.error('❌ Error generating credentials:', error.message);
    process.exit(1);
  }
}

module.exports = { generateStrongCredentials };