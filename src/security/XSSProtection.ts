/**
 * XSS Protection System
 * Provides Cross-Site Scripting (XSS) protection utilities
 */

import DOMPurify from 'isomorphic-dompurify';

export interface XSSProtectionConfig {
  allowedTags?: string[];
  allowedAttributes?: string[];
  allowedSchemes?: string[];
  stripIgnoreTag?: boolean;
  stripIgnoreTagBody?: string[];
}

export interface SanitizationResult {
  sanitized: string;
  removed: string[];
  modified: boolean;
}

export class XSSProtection {
  private static instance: XSSProtection;
  private defaultConfig: XSSProtectionConfig;

  private constructor() {
    this.defaultConfig = {
      allowedTags: [
        'b', 'i', 'em', 'strong', 'u', 's', 'sup', 'sub',
        'p', 'br', 'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img'
      ],
      allowedAttributes: [
        'href', 'title', 'alt', 'src', 'width', 'height',
        'class', 'id', 'style'
      ],
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed']
    };
  }

  public static getInstance(): XSSProtection {
    if (!XSSProtection.instance) {
      XSSProtection.instance = new XSSProtection();
    }
    return XSSProtection.instance;
  }

  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  public sanitizeHTML(
    html: string,
    config: Partial<XSSProtectionConfig> = {}
  ): SanitizationResult {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const originalLength = html.length;
    
    try {
      // Configure DOMPurify
      const purifyConfig: Record<string, unknown> = {
        ALLOWED_TAGS: mergedConfig.allowedTags,
        ALLOWED_ATTR: mergedConfig.allowedAttributes,
        ALLOWED_URI_REGEXP: new RegExp(
          `^(?:(?:${mergedConfig.allowedSchemes?.join('|')}):)`,
          'i'
        ),
        KEEP_CONTENT: !mergedConfig.stripIgnoreTag,
        FORBID_TAGS: mergedConfig.stripIgnoreTagBody,
        FORBID_CONTENTS: mergedConfig.stripIgnoreTagBody
      };

      // Sanitize the HTML
      const sanitizedTrustedHTML = DOMPurify.sanitize(html, purifyConfig);
      const sanitized = String(sanitizedTrustedHTML);
      
      // Detect what was removed/modified
      const removed = this.detectRemovedContent(html, sanitized);
      const modified = sanitized !== html;

      if (modified) {
        console.log(`🧹 XSS Protection: Sanitized HTML content (${originalLength} -> ${sanitized.length} chars)`);
        if (removed.length > 0) {
          console.log(`   Removed elements: ${removed.join(', ')}`);
        }
      }

      return {
        sanitized,
        removed,
        modified
      };
    } catch {
      console.error('HTML sanitization failed:', error);
      // Return empty string as fallback for security
      return {
        sanitized: '',
        removed: ['*'],
        modified: true
      };
    }
  }

  /**
   * Escape HTML entities in plain text
   */
  public escapeHTML(text: string): string {
    const entityMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };

    return text.replace(/[&<>"'`=/]/g, (char) => entityMap[char]);
  }

  /**
   * Unescape HTML entities
   */
  public unescapeHTML(html: string): string {
    const entityMap: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };

    return html.replace(/&(?:amp|lt|gt|quot|#39|#x2F|#x60|#x3D);/g, (entity) => entityMap[entity]);
  }

  /**
   * Sanitize user input for safe display
   */
  public sanitizeUserInput(input: string, allowHTML: boolean = false): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Trim whitespace
    let sanitized = input.trim();

    if (allowHTML) {
      // Sanitize HTML while preserving safe tags
      const result = this.sanitizeHTML(sanitized, {
        allowedTags: ['b', 'i', 'em', 'strong', 'u', 'br', 'p'],
        allowedAttributes: [],
        stripIgnoreTag: true
      });
      sanitized = result.sanitized;
    } else {
      // Escape all HTML
      sanitized = this.escapeHTML(sanitized);
    }

    // Additional sanitization
    sanitized = this.removeControlCharacters(sanitized);
    sanitized = this.limitLength(sanitized, 10000); // Prevent DoS via large inputs

    return sanitized;
  }

  /**
   * Validate and sanitize URL to prevent XSS via href attributes
   */
  public sanitizeURL(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    // Remove whitespace and control characters
    // eslint-disable-next-line no-control-regex
    const cleanUrl = url.trim().replace(/[\u0000-\u001F\u007F]/g, '');

    // Check for dangerous protocols
    const dangerousProtocols = [
      'javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'
    ];

    const lowerUrl = cleanUrl.toLowerCase();
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        console.warn(`🚨 Blocked dangerous URL protocol: ${protocol}`);
        return null;
      }
    }

    // Allow only safe protocols
    const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
    const hasProtocol = safeProtocols.some(protocol => lowerUrl.startsWith(protocol));
    
    // If no protocol, assume relative URL (which is safe)
    if (!hasProtocol && !lowerUrl.includes(':')) {
      return cleanUrl;
    }

    // If has protocol, ensure it's safe
    if (hasProtocol) {
      return cleanUrl;
    }

    // Unknown protocol, reject
    console.warn(`🚨 Blocked URL with unknown protocol: ${cleanUrl}`);
    return null;
  }

  /**
   * Create Content Security Policy (CSP) header value
   */
  public generateCSPHeader(config: {
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
    reportUri?: string;
    upgradeInsecureRequests?: boolean;
  } = {}): string {
    const directives: string[] = [];

    // Default source
    directives.push("default-src 'self'");

    // Script sources
    const scriptSrc = config.scriptSrc || ["'self'", "'unsafe-inline'"];
    directives.push(`script-src ${scriptSrc.join(' ')}`);

    // Style sources
    const styleSrc = config.styleSrc || ["'self'", "'unsafe-inline'"];
    directives.push(`style-src ${styleSrc.join(' ')}`);

    // Image sources
    const imgSrc = config.imgSrc || ["'self'", 'data:', 'https:'];
    directives.push(`img-src ${imgSrc.join(' ')}`);

    // Connect sources (for AJAX, WebSocket, etc.)
    const connectSrc = config.connectSrc || ["'self'"];
    directives.push(`connect-src ${connectSrc.join(' ')}`);

    // Font sources
    const fontSrc = config.fontSrc || ["'self'", 'https:', 'data:'];
    directives.push(`font-src ${fontSrc.join(' ')}`);

    // Object sources (for plugins)
    const objectSrc = config.objectSrc || ["'none'"];
    directives.push(`object-src ${objectSrc.join(' ')}`);

    // Media sources
    const mediaSrc = config.mediaSrc || ["'self'"];
    directives.push(`media-src ${mediaSrc.join(' ')}`);

    // Frame sources
    const frameSrc = config.frameSrc || ["'none'"];
    directives.push(`frame-src ${frameSrc.join(' ')}`);

    // Base URI
    directives.push("base-uri 'self'");

    // Form action
    directives.push("form-action 'self'");

    // Upgrade insecure requests
    if (config.upgradeInsecureRequests !== false) {
      directives.push('upgrade-insecure-requests');
    }

    // Report URI
    if (config.reportUri) {
      directives.push(`report-uri ${config.reportUri}`);
    }

    return directives.join('; ');
  }

  /**
   * Validate JSON input to prevent prototype pollution
   */
  public sanitizeJSON(jsonString: string): unknown {
    try {
      const parsed = JSON.parse(jsonString);
      return this.removePrototypePollution(parsed);
    } catch {
      throw new Error('Invalid JSON input');
    }
  }

  /**
   * Remove potential prototype pollution from object
   */
  public removePrototypePollution(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removePrototypePollution(item));
    }

    const cleaned: unknown = {};
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    for (const [key, value] of Object.entries(obj)) {
      if (dangerousKeys.includes(key)) {
        console.warn(`🚨 Removed dangerous key from object: ${key}`);
        continue;
      }

      cleaned[key] = this.removePrototypePollution(value);
    }

    return cleaned;
  }

  private detectRemovedContent(original: string, sanitized: string): string[] {
    const removed: string[] = [];

    // Simple detection of removed script tags
    const scriptMatches = original.match(/<script[^>]*>/gi);
    if (scriptMatches && !sanitized.includes('<script')) {
      removed.push('script');
    }

    // Detect removed event handlers
    const eventHandlers = original.match(/on\w+\s*=/gi);
    if (eventHandlers && eventHandlers.length > 0) {
      const sanitizedHandlers = sanitized.match(/on\w+\s*=/gi);
      if (!sanitizedHandlers || sanitizedHandlers.length < eventHandlers.length) {
        removed.push('event-handlers');
      }
    }

    // Detect removed javascript: URLs
    if (original.includes('javascript:') && !sanitized.includes('javascript:')) {
      removed.push('javascript-urls');
    }

    return removed;
  }

  private removeControlCharacters(text: string): string {
    // Remove control characters except tab, newline, and carriage return
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }

  private limitLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    console.warn(`🚨 Input truncated from ${text.length} to ${maxLength} characters`);
    return text.substring(0, maxLength);
  }

  /**
   * Get XSS protection statistics
   */
  public getStatistics(): {
    totalSanitizations: number;
    htmlSanitizations: number;
    urlSanitizations: number;
    blockedUrls: number;
  } {
    // In a real implementation, these would be tracked
    return {
      totalSanitizations: 0,
      htmlSanitizations: 0,
      urlSanitizations: 0,
      blockedUrls: 0
    };
  }
}

// Export singleton instance
export const xssProtection = XSSProtection.getInstance();