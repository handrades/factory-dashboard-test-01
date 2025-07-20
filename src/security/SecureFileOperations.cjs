const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { InputValidator } = require('./InputValidator.cjs');

class SecureFileOperations {
  constructor(config = {}) {
    this.validator = new InputValidator();
    this.config = {
      allowedExtensions: config.allowedExtensions || ['.json', '.txt', '.log', '.csv', '.md'],
      allowedDirectories: config.allowedDirectories || [],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
      sandboxPath: config.sandboxPath || process.cwd(),
      enableChecksums: config.enableChecksums || true,
      ...config
    };

    // Normalize sandbox path
    this.config.sandboxPath = path.resolve(this.config.sandboxPath);
  }

  validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path must be a non-empty string');
    }

    // Check for path traversal
    if (this.validator.detectPathTraversal(filePath)) {
      throw new Error('Path traversal detected');
    }

    // Resolve the path and ensure it's within sandbox
    const resolvedPath = path.resolve(this.config.sandboxPath, filePath);
    
    if (!resolvedPath.startsWith(this.config.sandboxPath)) {
      throw new Error('Path outside of allowed directory');
    }

    // Check allowed directories if specified
    if (this.config.allowedDirectories.length > 0) {
      const isAllowed = this.config.allowedDirectories.some(allowedDir => {
        const fullAllowedPath = path.resolve(this.config.sandboxPath, allowedDir);
        return resolvedPath.startsWith(fullAllowedPath);
      });

      if (!isAllowed) {
        throw new Error('Path not in allowed directories');
      }
    }

    return resolvedPath;
  }

  validateExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (this.config.allowedExtensions.length > 0 && !this.config.allowedExtensions.includes(ext)) {
      throw new Error(`File extension '${ext}' not allowed`);
    }

    return ext;
  }

  validateFileName(fileName) {
    this.validator.validateFileName(fileName);

    // Additional checks for reserved patterns
    const reservedPatterns = [
      /^\./, // Hidden files (optional restriction)
      /\$/, // Variables
      /%/, // URL encoding
    ];

    // Only warn for reserved patterns, don't block
    for (const pattern of reservedPatterns) {
      if (pattern.test(fileName)) {
        console.warn(`Warning: Filename '${fileName}' contains potentially problematic pattern`);
      }
    }

    return fileName;
  }

  async checkFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > this.config.maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds maximum allowed size ${this.config.maxFileSize}`);
      }

      return stats.size;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // File doesn't exist
      }
      throw error;
    }
  }

  generateChecksum(content) {
    if (!this.config.enableChecksums) {
      return null;
    }

    return crypto.createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
  }

  async verifyChecksum(filePath, expectedChecksum) {
    if (!this.config.enableChecksums || !expectedChecksum) {
      return true;
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const actualChecksum = this.generateChecksum(content);
      
      return actualChecksum === expectedChecksum;
    } catch (error) {
      console.error('Checksum verification failed:', error.message);
      return false;
    }
  }

  async safeReadFile(filePath, options = {}) {
    const validatedPath = this.validatePath(filePath);
    this.validateExtension(validatedPath);
    
    // Check file size
    await this.checkFileSize(validatedPath);

    try {
      const content = await fs.readFile(validatedPath, options.encoding || 'utf8');
      
      // Verify checksum if provided
      if (options.expectedChecksum) {
        const isValid = await this.verifyChecksum(validatedPath, options.expectedChecksum);
        if (!isValid) {
          throw new Error('File checksum verification failed');
        }
      }

      // Sanitize content if it's a string
      if (typeof content === 'string' && options.sanitize !== false) {
        return this.validator.sanitizeInput(content, {
          preventXSS: options.preventXSS !== false,
          preventSQLInjection: options.preventSQLInjection !== false,
          maxLength: options.maxContentLength
        });
      }

      return content;
    } catch (error) {
      console.error(`Secure file read failed for ${filePath}:`, error.message);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async safeWriteFile(filePath, content, options = {}) {
    const validatedPath = this.validatePath(filePath);
    this.validateExtension(validatedPath);
    this.validateFileName(path.basename(validatedPath));

    // Validate content
    if (content === null || content === undefined) {
      throw new Error('Content cannot be null or undefined');
    }

    let sanitizedContent = content;

    // Sanitize string content
    if (typeof content === 'string') {
      // Check content size
      if (Buffer.byteLength(content, 'utf8') > this.config.maxFileSize) {
        throw new Error('Content size exceeds maximum allowed file size');
      }

      if (options.sanitize !== false) {
        sanitizedContent = this.validator.sanitizeInput(content, {
          preventXSS: options.preventXSS !== false,
          preventSQLInjection: options.preventSQLInjection !== false
        });
      }
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(validatedPath);
      await fs.mkdir(dir, { recursive: true });

      // Create backup if file exists and backup is enabled
      if (options.createBackup !== false) {
        try {
          await fs.access(validatedPath);
          const backupPath = `${validatedPath}.backup.${Date.now()}`;
          await fs.copyFile(validatedPath, backupPath);
          console.log(`Backup created: ${backupPath}`);
        } catch (error) {
          // File doesn't exist, no backup needed
        }
      }

      // Write atomically using a temporary file
      const tempPath = `${validatedPath}.tmp.${Date.now()}`;
      
      await fs.writeFile(tempPath, sanitizedContent, {
        encoding: options.encoding || 'utf8',
        mode: options.mode || 0o644
      });

      // Move temp file to final location
      await fs.rename(tempPath, validatedPath);

      // Generate and store checksum
      const checksum = this.generateChecksum(sanitizedContent);
      
      console.log(`Secure file write completed: ${validatedPath}`);
      
      return {
        path: validatedPath,
        size: Buffer.byteLength(sanitizedContent, 'utf8'),
        checksum
      };

    } catch (error) {
      console.error(`Secure file write failed for ${filePath}:`, error.message);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  async safeDeleteFile(filePath, options = {}) {
    const validatedPath = this.validatePath(filePath);

    try {
      // Create backup before deletion if requested
      if (options.createBackup) {
        const backupPath = `${validatedPath}.deleted.${Date.now()}`;
        await fs.copyFile(validatedPath, backupPath);
        console.log(`Backup created before deletion: ${backupPath}`);
      }

      await fs.unlink(validatedPath);
      console.log(`Secure file deletion completed: ${validatedPath}`);
      
      return { deleted: validatedPath };

    } catch (error) {
      console.error(`Secure file delete failed for ${filePath}:`, error.message);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async safeListDirectory(dirPath, options = {}) {
    const validatedPath = this.validatePath(dirPath);

    try {
      const entries = await fs.readdir(validatedPath, { withFileTypes: true });
      
      const result = {
        files: [],
        directories: [],
        path: validatedPath
      };

      for (const entry of entries) {
        const entryPath = path.join(validatedPath, entry.name);
        
        // Skip hidden files unless explicitly allowed
        if (entry.name.startsWith('.') && !options.includeHidden) {
          continue;
        }

        // Validate file extension if it's a file
        if (entry.isFile()) {
          try {
            this.validateExtension(entry.name);
            const stats = await fs.stat(entryPath);
            
            result.files.push({
              name: entry.name,
              path: entryPath,
              size: stats.size,
              modified: stats.mtime,
              extension: path.extname(entry.name)
            });
          } catch (error) {
            console.warn(`Skipping file ${entry.name}: ${error.message}`);
          }
        } else if (entry.isDirectory() && options.includeDirectories !== false) {
          result.directories.push({
            name: entry.name,
            path: entryPath
          });
        }
      }

      // Sort results
      result.files.sort((a, b) => a.name.localeCompare(b.name));
      result.directories.sort((a, b) => a.name.localeCompare(b.name));

      // Limit results if specified
      if (options.limit) {
        result.files = result.files.slice(0, options.limit);
        result.directories = result.directories.slice(0, options.limit);
      }

      return result;

    } catch (error) {
      console.error(`Secure directory listing failed for ${dirPath}:`, error.message);
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  async safeFileExists(filePath) {
    try {
      const validatedPath = this.validatePath(filePath);
      await fs.access(validatedPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(filePath) {
    const validatedPath = this.validatePath(filePath);

    try {
      const stats = await fs.stat(validatedPath);
      const content = await fs.readFile(validatedPath, 'utf8');
      
      return {
        path: validatedPath,
        name: path.basename(validatedPath),
        extension: path.extname(validatedPath),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        checksum: this.generateChecksum(content)
      };

    } catch (error) {
      console.error(`Failed to get file info for ${filePath}:`, error.message);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  // Utility method to create a secure temporary file
  async createTempFile(prefix = 'secure', extension = '.tmp') {
    this.validateExtension(extension);
    
    const tempName = `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${extension}`;
    const tempPath = path.join(this.config.sandboxPath, 'temp', tempName);
    
    // Ensure temp directory exists
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    
    return tempPath;
  }

  // Method to clean up old backup files
  async cleanupBackups(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    try {
      const files = await this.safeListDirectory('.', { includeHidden: true });
      const now = Date.now();
      let cleaned = 0;

      for (const file of files.files) {
        if (file.name.includes('.backup.') || file.name.includes('.deleted.')) {
          const age = now - file.modified.getTime();
          
          if (age > maxAge) {
            await this.safeDeleteFile(file.name);
            cleaned++;
          }
        }
      }

      console.log(`Cleaned up ${cleaned} old backup files`);
      return cleaned;

    } catch (error) {
      console.error('Backup cleanup failed:', error.message);
      return 0;
    }
  }
}

module.exports = SecureFileOperations;