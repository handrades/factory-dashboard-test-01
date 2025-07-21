/**
 * Password Management System
 * Handles password hashing, validation, and strength checking
 */

import { hash, compare, genSalt } from 'bcrypt';
import { randomBytes } from 'crypto';

export interface PasswordValidationResult {
  isValid: boolean;
  score: number;
  feedback: string[];
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumbers: boolean;
    hasSpecialChars: boolean;
    notCommon: boolean;
  };
}

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

export class PasswordManager {
  private static instance: PasswordManager;
  private readonly saltRounds: number = 12;
  private readonly minLength: number = 8;
  private readonly maxLength: number = 128;
  
  // Common passwords to reject
  private readonly commonPasswords: Set<string> = new Set([
    'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
    'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1',
    'factory', 'dashboard', 'admin123', 'root', 'user', 'guest'
  ]);

  private constructor() {}

  public static getInstance(): PasswordManager {
    if (!PasswordManager.instance) {
      PasswordManager.instance = new PasswordManager();
    }
    return PasswordManager.instance;
  }

  /**
   * Hash a password with bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    try {
      // Validate password before hashing
      const validation = this.validatePassword(password);
      if (!validation.isValid) {
        throw new Error(`Password validation failed: ${validation.feedback.join(', ')}`);
      }

      const salt = await genSalt(this.saltRounds);
      const hashedPassword = await hash(password, salt);
      
      return hashedPassword;
    } catch (error) {
      console.error('Password hashing failed:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against its hash
   */
  public async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      return await compare(password, hashedPassword);
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Validate password strength and requirements
   */
  public validatePassword(password: string): PasswordValidationResult {
    const feedback: string[] = [];
    let score = 0;

    // Check length
    const hasMinLength = password.length >= this.minLength;
    const hasMaxLength = password.length <= this.maxLength;
    
    if (!hasMinLength) {
      feedback.push(`Password must be at least ${this.minLength} characters long`);
    } else {
      score += 1;
    }

    if (!hasMaxLength) {
      feedback.push(`Password must be no more than ${this.maxLength} characters long`);
    }

    // Check character requirements
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    if (!hasUppercase) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!hasLowercase) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!hasNumbers) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!hasSpecialChars) {
      feedback.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    // Check against common passwords
    const notCommon = !this.commonPasswords.has(password.toLowerCase());
    if (!notCommon) {
      feedback.push('Password is too common, please choose a more unique password');
    } else {
      score += 1;
    }

    // Additional strength checks
    if (password.length >= 12) {
      score += 1;
    }

    if (password.length >= 16) {
      score += 1;
    }

    // Check for repeated characters
    if (!/(.)\1{2,}/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should not contain repeated characters');
    }

    // Check for sequential characters
    if (!this.hasSequentialChars(password)) {
      score += 1;
    } else {
      feedback.push('Password should not contain sequential characters (e.g., 123, abc)');
    }

    const requirements = {
      minLength: hasMinLength,
      hasUppercase,
      hasLowercase,
      hasNumbers,
      hasSpecialChars,
      notCommon
    };

    const isValid = hasMinLength && hasMaxLength && hasUppercase && 
                   hasLowercase && hasNumbers && hasSpecialChars && notCommon;

    return {
      isValid,
      score: Math.min(score, 10), // Cap at 10
      feedback,
      requirements
    };
  }

  /**
   * Generate a secure random password
   */
  public generateSecurePassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = uppercase + lowercase + numbers + specialChars;
    
    let password = '';
    
    // Ensure at least one character from each category
    password += this.getRandomChar(uppercase);
    password += this.getRandomChar(lowercase);
    password += this.getRandomChar(numbers);
    password += this.getRandomChar(specialChars);
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += this.getRandomChar(allChars);
    }
    
    // Shuffle the password to avoid predictable patterns
    return this.shuffleString(password);
  }

  /**
   * Generate a temporary password for password reset
   */
  public generateTemporaryPassword(): string {
    return this.generateSecurePassword(12);
  }

  /**
   * Check if password needs to be updated (age-based)
   */
  public isPasswordExpired(lastChanged: Date, maxAgeInDays: number = 90): boolean {
    const ageInMs = Date.now() - lastChanged.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
    return ageInDays > maxAgeInDays;
  }

  /**
   * Generate password reset token
   */
  public generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Get password strength description
   */
  public getPasswordStrengthDescription(score: number): {
    level: string;
    description: string;
    color: string;
  } {
    if (score <= 3) {
      return {
        level: 'Weak',
        description: 'Password is weak and easily guessable',
        color: 'red'
      };
    } else if (score <= 6) {
      return {
        level: 'Fair',
        description: 'Password is fair but could be stronger',
        color: 'orange'
      };
    } else if (score <= 8) {
      return {
        level: 'Good',
        description: 'Password is good and reasonably secure',
        color: 'yellow'
      };
    } else {
      return {
        level: 'Strong',
        description: 'Password is strong and very secure',
        color: 'green'
      };
    }
  }

  private hasSequentialChars(password: string): boolean {
    const sequences = [
      '0123456789',
      'abcdefghijklmnopqrstuvwxyz',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm'
    ];

    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 3; i++) {
        const subseq = sequence.substring(i, i + 3);
        if (password.toLowerCase().includes(subseq)) {
          return true;
        }
      }
    }

    return false;
  }

  private getRandomChar(chars: string): string {
    const randomIndex = Math.floor(Math.random() * chars.length);
    return chars[randomIndex];
  }

  private shuffleString(str: string): string {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }
}

// Export singleton instance
export const passwordManager = PasswordManager.getInstance();