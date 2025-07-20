const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecretManager {
  constructor() {
    this.secrets = new Map();
    this.loadSecrets();
  }

  loadSecrets() {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        this.parseEnvFile(envContent);
      }
    } catch (error) {
      console.error('Error loading secrets:', this.maskError(error.message));
    }
  }

  parseEnvFile(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          this.secrets.set(key.trim(), value.trim());
        }
      }
    }
  }

  get(key) {
    const value = this.secrets.get(key) || process.env[key];
    if (!value) {
      throw new Error(`Secret '${key}' not found`);
    }
    return value;
  }

  set(key, value) {
    this.secrets.set(key, value);
    process.env[key] = value;
  }

  has(key) {
    return this.secrets.has(key) || !!process.env[key];
  }

  generateSecurePassword(length = 32) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(crypto.randomInt(0, charset.length));
    }
    return password;
  }

  generateToken(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  maskSecret(secret) {
    if (!secret || secret.length < 4) return '***';
    return secret.substring(0, 2) + '*'.repeat(secret.length - 4) + secret.substring(secret.length - 2);
  }

  maskError(errorMessage) {
    // Remove any potential secrets from error messages
    let maskedMessage = errorMessage;
    this.secrets.forEach((value, key) => {
      if (value && value.length > 3) {
        const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        maskedMessage = maskedMessage.replace(regex, this.maskSecret(value));
      }
    });
    return maskedMessage;
  }

  validateCredentials() {
    const requiredSecrets = [
      'REDIS_PASSWORD',
      'INFLUXDB_USERNAME',
      'INFLUXDB_PASSWORD',
      'INFLUXDB_TOKEN'
    ];

    const missing = requiredSecrets.filter(key => !this.has(key));
    if (missing.length > 0) {
      throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    }

    // Check for weak passwords
    const weakPasswords = [];
    requiredSecrets.forEach(key => {
      if (key.includes('PASSWORD')) {
        const value = this.get(key);
        if (value.length < 12 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
          weakPasswords.push(key);
        }
      }
    });

    if (weakPasswords.length > 0) {
      console.warn(`Weak passwords detected for: ${weakPasswords.join(', ')}`);
    }

    return true;
  }
}

module.exports = SecretManager;