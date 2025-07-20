import bcrypt from 'bcrypt';
import { AuthConfig } from '../types/auth-types.js';

export class PasswordManager {
  private config: AuthConfig['passwordComplexity'];
  private minLength: number;
  private saltRounds: number = 12;

  constructor(minLength: number, complexityConfig: AuthConfig['passwordComplexity']) {
    this.minLength = minLength;
    this.config = complexityConfig;
  }

  async hashPassword(password: string): Promise<string> {
    this.validatePassword(password);
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  validatePassword(password: string): void {
    const errors: string[] = [];

    if (password.length < this.minLength) {
      errors.push(`Password must be at least ${this.minLength} characters long`);
    }

    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.config.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common weak patterns
    if (this.isCommonPassword(password)) {
      errors.push('Password is too common or predictable');
    }

    if (this.hasRepeatingCharacters(password)) {
      errors.push('Password cannot have more than 2 consecutive identical characters');
    }

    if (errors.length > 0) {
      throw new Error(`Password validation failed: ${errors.join(', ')}`);
    }
  }

  generateSecurePassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = '';
    let password = '';

    // Ensure at least one character from each required set
    if (this.config.requireUppercase) {
      charset += uppercase;
      password += this.getRandomChar(uppercase);
    }

    if (this.config.requireLowercase) {
      charset += lowercase;
      password += this.getRandomChar(lowercase);
    }

    if (this.config.requireNumbers) {
      charset += numbers;
      password += this.getRandomChar(numbers);
    }

    if (this.config.requireSpecialChars) {
      charset += specialChars;
      password += this.getRandomChar(specialChars);
    }

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += this.getRandomChar(charset);
    }

    // Shuffle the password to avoid predictable patterns
    return this.shuffleString(password);
  }

  private getRandomChar(charset: string): string {
    return charset.charAt(Math.floor(Math.random() * charset.length));
  }

  private shuffleString(str: string): string {
    const array = str.split('');
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array.join('');
  }

  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      'dragon', 'master', 'sunshine', 'princess', 'football',
      'charlie', 'aa123456', 'donald', 'password1', 'qwerty123'
    ];

    const lowerPassword = password.toLowerCase();
    return commonPasswords.includes(lowerPassword);
  }

  private hasRepeatingCharacters(password: string): boolean {
    let consecutiveCount = 1;
    
    for (let i = 1; i < password.length; i++) {
      if (password[i] === password[i - 1]) {
        consecutiveCount++;
        if (consecutiveCount > 2) {
          return true;
        }
      } else {
        consecutiveCount = 1;
      }
    }
    
    return false;
  }

  estimatePasswordStrength(password: string): {
    score: number;
    feedback: string[];
    entropy: number;
  } {
    const feedback: string[] = [];
    let score = 0;
    
    // Length scoring
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    else if (password.length < 8) feedback.push('Use at least 8 characters');

    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');

    if (/\d/.test(password)) score += 1;
    else feedback.push('Add numbers');

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    else feedback.push('Add special characters');

    // Penalties
    if (this.isCommonPassword(password)) {
      score -= 2;
      feedback.push('Avoid common passwords');
    }

    if (this.hasRepeatingCharacters(password)) {
      score -= 1;
      feedback.push('Avoid repeated characters');
    }

    // Calculate entropy
    const charset = this.getCharsetSize(password);
    const entropy = password.length * Math.log2(charset);

    return {
      score: Math.max(0, Math.min(5, score)),
      feedback,
      entropy
    };
  }

  private getCharsetSize(password: string): number {
    let size = 0;
    if (/[a-z]/.test(password)) size += 26;
    if (/[A-Z]/.test(password)) size += 26;
    if (/\d/.test(password)) size += 10;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) size += 32;
    return size;
  }
}