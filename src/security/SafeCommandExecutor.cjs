const { spawn } = require('child_process');
const path = require('path');

class SafeCommandExecutor {
  constructor() {
    // Whitelist of allowed commands and their safe patterns
    this.allowedCommands = {
      docker: {
        executable: 'docker',
        allowedSubcommands: ['restart', 'stop', 'network', 'run'],
        patterns: {
          restart: /^[a-zA-Z0-9_-]+$/,
          stop: /^[a-zA-Z0-9_-]+$/,
          network: /^(connect|disconnect)$/,
          run: /^--rm\s+--name\s+[a-zA-Z0-9_-]+/
        }
      }
    };
  }

  validateCommand(command, args) {
    const allowedCommand = this.allowedCommands[command];
    if (!allowedCommand) {
      throw new Error(`Command '${command}' is not allowed`);
    }

    // Validate each argument
    for (const arg of args) {
      if (this.containsInjectionAttempt(arg)) {
        throw new Error(`Argument contains potential injection: ${arg}`);
      }
    }

    return true;
  }

  containsInjectionAttempt(input) {
    // Check for common injection patterns
    const injectionPatterns = [
      /[;&|`$(){}]/,  // Shell metacharacters
      /\.\.\//,       // Path traversal
      /--[a-zA-Z-]+=.*[;&|`$(){}]/, // Flag injection
      /^\s*-/,        // Leading dash (potential flag)
      /\s+(rm|del|format|mkfs|dd)\s+/i, // Dangerous commands
    ];

    return injectionPatterns.some(pattern => pattern.test(input));
  }

  sanitizeArgument(arg) {
    // Remove or escape dangerous characters
    return arg
      .replace(/[;&|`$(){}]/g, '') // Remove shell metacharacters
      .replace(/\.\.\//g, '')      // Remove path traversal
      .trim();
  }

  async executeDockerCommand(subcommand, args = []) {
    this.validateCommand('docker', [subcommand, ...args]);
    
    const sanitizedArgs = [subcommand, ...args.map(arg => this.sanitizeArgument(arg))];
    
    return this.executeCommand('docker', sanitizedArgs);
  }

  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!command || typeof command !== 'string') {
        return reject(new Error('Invalid command'));
      }

      if (!Array.isArray(args)) {
        return reject(new Error('Args must be an array'));
      }

      // Set safe defaults
      const safeOptions = {
        timeout: options.timeout || 30000, // 30 second default timeout
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: options.stdio || ['ignore', 'pipe', 'pipe']
      };

      // Spawn the process
      const child = spawn(command, args, safeOptions);
      
      let stdout = '';
      let stderr = '';
      
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }
      
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${safeOptions.timeout}ms`));
      }, safeOptions.timeout);

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        
        if (signal) {
          reject(new Error(`Command terminated by signal: ${signal}`));
        } else if (code === 0) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to start command: ${error.message}`));
      });
    });
  }

  // Safe predefined operations for chaos testing
  async restartDockerContainer(containerName) {
    // Validate container name format
    if (!/^[a-zA-Z0-9_-]+$/.test(containerName)) {
      throw new Error('Invalid container name format');
    }

    return this.executeDockerCommand('restart', [containerName]);
  }

  async stopDockerContainer(containerName) {
    if (!/^[a-zA-Z0-9_-]+$/.test(containerName)) {
      throw new Error('Invalid container name format');
    }

    return this.executeDockerCommand('stop', [containerName]);
  }

  async disconnectFromNetwork(networkName, containerName) {
    if (!/^[a-zA-Z0-9_-]+$/.test(networkName) || !/^[a-zA-Z0-9_-]+$/.test(containerName)) {
      throw new Error('Invalid network or container name format');
    }

    return this.executeDockerCommand('network', ['disconnect', networkName, containerName]);
  }

  async connectToNetwork(networkName, containerName) {
    if (!/^[a-zA-Z0-9_-]+$/.test(networkName) || !/^[a-zA-Z0-9_-]+$/.test(containerName)) {
      throw new Error('Invalid network or container name format');
    }

    return this.executeDockerCommand('network', ['connect', networkName, containerName]);
  }

  async runStressContainer(stressType, name) {
    const allowedStressTypes = ['cpu', 'memory', 'disk'];
    if (!allowedStressTypes.includes(stressType)) {
      throw new Error('Invalid stress type');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Invalid container name format');
    }

    const stressCommands = {
      cpu: ['--rm', '--name', name, '-d', 'stress:latest', 'stress', '--cpu', '4'],
      memory: ['--rm', '--name', name, '-d', 'stress:latest', 'stress', '--vm', '1', '--vm-bytes', '1G'],
      disk: ['--rm', '--name', name, '-d', 'stress:latest', 'stress', '--io', '4']
    };

    return this.executeDockerCommand('run', stressCommands[stressType]);
  }
}

module.exports = SafeCommandExecutor;