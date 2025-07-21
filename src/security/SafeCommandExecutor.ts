/**
 * Safe Command Executor
 * Provides secure command execution with input validation and sanitization
 */

import { spawn } from 'child_process';

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

export interface CommandOptions {
  timeout?: number;
  maxBuffer?: number;
  allowedCommands?: string[];
  sanitizeInput?: boolean;
  logExecution?: boolean;
}

export class SafeCommandExecutor {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_MAX_BUFFER = 1024 * 1024; // 1MB
  private static readonly DANGEROUS_PATTERNS = [
    /[;&|`$(){}[\]]/g,  // Shell metacharacters
    /\.\./g,            // Path traversal
    /\/etc\/passwd/g,   // System file access
    /rm\s+-rf/g,        // Dangerous rm commands
    /sudo/g,            // Privilege escalation
    /chmod/g,           // Permission changes
    /chown/g,           // Ownership changes
  ];

  /**
   * Execute a command safely with input validation
   */
  public static async executeCommand(
    command: string,
    args: string[] = [],
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    
    try {
      // Validate and sanitize inputs
      const sanitizedCommand = this.sanitizeCommand(command, options.allowedCommands);
      const sanitizedArgs = options.sanitizeInput !== false 
        ? args.map(arg => this.sanitizeArgument(arg))
        : args;

      // Log execution if enabled
      if (options.logExecution !== false) {
        console.log(`🔧 Executing command: ${sanitizedCommand} ${sanitizedArgs.join(' ')}`);
      }

      // Execute command with spawn for better security
      const result = await this.spawnCommand(sanitizedCommand, sanitizedArgs, options);
      
      const executionTime = Date.now() - startTime;
      
      return {
        ...result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        executionTime
      };
    }
  }

  /**
   * Execute a Docker command safely
   */
  public static async executeDockerCommand(
    dockerCommand: string,
    containerName: string,
    additionalArgs: string[] = [],
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    // Validate Docker command
    const allowedDockerCommands = [
      'start', 'stop', 'restart', 'logs', 'inspect', 'stats'
    ];
    
    if (!allowedDockerCommands.includes(dockerCommand)) {
      throw new Error(`Docker command '${dockerCommand}' is not allowed`);
    }

    // Validate container name
    const sanitizedContainerName = this.sanitizeContainerName(containerName);
    
    const args = [dockerCommand, sanitizedContainerName, ...additionalArgs];
    
    return this.executeCommand('docker', args, {
      ...options,
      allowedCommands: ['docker'],
      logExecution: true
    });
  }

  /**
   * Execute a network command safely (for testing purposes)
   */
  public static async executeNetworkCommand(
    networkCommand: string,
    networkName: string,
    containerName: string,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const allowedNetworkCommands = ['connect', 'disconnect'];
    
    if (!allowedNetworkCommands.includes(networkCommand)) {
      throw new Error(`Network command '${networkCommand}' is not allowed`);
    }

    const sanitizedNetworkName = this.sanitizeNetworkName(networkName);
    const sanitizedContainerName = this.sanitizeContainerName(containerName);
    
    const args = ['network', networkCommand, sanitizedNetworkName, sanitizedContainerName];
    
    return this.executeCommand('docker', args, {
      ...options,
      allowedCommands: ['docker'],
      logExecution: true
    });
  }

  private static async spawnCommand(
    command: string,
    args: string[],
    options: CommandOptions
  ): Promise<Omit<CommandResult, 'executionTime'>> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        timeout: options.timeout || this.DEFAULT_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > (options.maxBuffer || this.DEFAULT_MAX_BUFFER)) {
          child.kill();
          reject(new Error('Command output exceeded maximum buffer size'));
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > (options.maxBuffer || this.DEFAULT_MAX_BUFFER)) {
          child.kill();
          reject(new Error('Command error output exceeded maximum buffer size'));
        }
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          reject(new Error(`Command timed out after ${options.timeout || this.DEFAULT_TIMEOUT}ms`));
        }
      }, options.timeout || this.DEFAULT_TIMEOUT);
    });
  }

  private static sanitizeCommand(command: string, allowedCommands?: string[]): string {
    // Check if command is in allowed list
    if (allowedCommands && !allowedCommands.includes(command)) {
      throw new Error(`Command '${command}' is not in the allowed commands list`);
    }

    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(`Command contains dangerous pattern: ${command}`);
      }
    }

    // Only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
      throw new Error(`Command contains invalid characters: ${command}`);
    }

    return command;
  }

  private static sanitizeArgument(arg: string): string {
    // Remove dangerous characters and patterns
    let sanitized = arg;
    
    for (const pattern of this.DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Limit argument length
    if (sanitized.length > 256) {
      throw new Error(`Argument too long: ${sanitized.substring(0, 50)}...`);
    }

    return sanitized;
  }

  private static sanitizeContainerName(containerName: string): string {
    // Docker container names should only contain alphanumeric, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(containerName)) {
      throw new Error(`Invalid container name: ${containerName}`);
    }

    // Prevent path traversal in container names
    if (containerName.includes('..') || containerName.includes('/')) {
      throw new Error(`Container name contains invalid path characters: ${containerName}`);
    }

    return containerName;
  }

  private static sanitizeNetworkName(networkName: string): string {
    // Docker network names should only contain alphanumeric, hyphens, underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(networkName)) {
      throw new Error(`Invalid network name: ${networkName}`);
    }

    return networkName;
  }
}

// Export convenience functions
export const executeCommand = SafeCommandExecutor.executeCommand;
export const executeDockerCommand = SafeCommandExecutor.executeDockerCommand;
export const executeNetworkCommand = SafeCommandExecutor.executeNetworkCommand;