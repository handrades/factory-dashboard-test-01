export interface MetricValue {
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface CounterMetric {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface GaugeMetric {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface HistogramMetric {
  name: string;
  value: number;
  buckets: number[];
  labels?: Record<string, string>;
}

export interface ServiceMetrics {
  counters: Map<string, CounterMetric>;
  gauges: Map<string, GaugeMetric>;
  histograms: Map<string, HistogramMetric>;
  startTime: Date;
}

export class MetricsCollector {
  private metrics: ServiceMetrics;
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.metrics = {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      startTime: new Date()
    };
  }

  // Counter operations
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    const existing = this.metrics.counters.get(key);
    
    if (existing) {
      existing.value += value;
    } else {
      this.metrics.counters.set(key, {
        name,
        value,
        labels
      });
    }
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.createKey(name, labels);
    return this.metrics.counters.get(key)?.value || 0;
  }

  // Gauge operations
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    this.metrics.gauges.set(key, {
      name,
      value,
      labels
    });
  }

  incrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    const existing = this.metrics.gauges.get(key);
    
    if (existing) {
      existing.value += value;
    } else {
      this.setGauge(name, value, labels);
    }
  }

  decrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.incrementGauge(name, -value, labels);
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.createKey(name, labels);
    return this.metrics.gauges.get(key)?.value || 0;
  }

  // Histogram operations
  recordHistogram(name: string, value: number, buckets: number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000], labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    this.metrics.histograms.set(key, {
      name,
      value,
      buckets,
      labels
    });
  }

  // Convenience methods for common metrics
  recordRequestDuration(duration: number, method?: string, status?: string): void {
    this.recordHistogram('request_duration_ms', duration, undefined, {
      method: method || 'unknown',
      status: status || 'unknown'
    });
  }

  recordMessageProcessingTime(duration: number, equipmentId?: string, success?: boolean): void {
    this.recordHistogram('message_processing_duration_ms', duration, undefined, {
      equipment_id: equipmentId || 'unknown',
      success: success ? 'true' : 'false'
    });
  }

  recordDataWriteTime(duration: number, measurement?: string, success?: boolean): void {
    this.recordHistogram('data_write_duration_ms', duration, undefined, {
      measurement: measurement || 'unknown',
      success: success ? 'true' : 'false'
    });
  }

  incrementMessageCount(equipmentId?: string, messageType?: string): void {
    this.incrementCounter('messages_processed_total', 1, {
      equipment_id: equipmentId || 'unknown',
      message_type: messageType || 'unknown'
    });
  }

  incrementErrorCount(errorType?: string, service?: string): void {
    this.incrementCounter('errors_total', 1, {
      error_type: errorType || 'unknown',
      service: service || this.serviceName
    });
  }

  setActiveConnections(count: number, connectionType?: string): void {
    this.setGauge('active_connections', count, {
      connection_type: connectionType || 'unknown'
    });
  }

  setQueueSize(size: number, queueName?: string): void {
    this.setGauge('queue_size', size, {
      queue_name: queueName || 'unknown'
    });
  }

  setMemoryUsage(bytes: number): void {
    this.setGauge('memory_usage_bytes', bytes);
  }

  setCPUUsage(percentage: number): void {
    this.setGauge('cpu_usage_percent', percentage);
  }

  // Utility methods
  private createKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    
    const sortedLabels = Object.keys(labels)
      .sort()
      .map(key => `${key}=${labels[key]}`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }

  // Export metrics in Prometheus format
  exportPrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Add service info
    lines.push(`# HELP service_info Service information`);
    lines.push(`# TYPE service_info gauge`);
    lines.push(`service_info{service="${this.serviceName}",version="1.0.0"} 1`);
    lines.push('');
    
    // Add uptime
    const uptime = Date.now() - this.metrics.startTime.getTime();
    lines.push(`# HELP service_uptime_seconds Service uptime in seconds`);
    lines.push(`# TYPE service_uptime_seconds counter`);
    lines.push(`service_uptime_seconds{service="${this.serviceName}"} ${uptime / 1000}`);
    lines.push('');
    
    // Export counters
    for (const [, counter] of this.metrics.counters) {
      lines.push(`# HELP ${counter.name} Counter metric`);
      lines.push(`# TYPE ${counter.name} counter`);
      const labels = counter.labels ? this.formatLabels(counter.labels) : '';
      lines.push(`${counter.name}${labels} ${counter.value}`);
      lines.push('');
    }
    
    // Export gauges
    for (const [, gauge] of this.metrics.gauges) {
      lines.push(`# HELP ${gauge.name} Gauge metric`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      const labels = gauge.labels ? this.formatLabels(gauge.labels) : '';
      lines.push(`${gauge.name}${labels} ${gauge.value}`);
      lines.push('');
    }
    
    // Export histograms
    for (const [, histogram] of this.metrics.histograms) {
      lines.push(`# HELP ${histogram.name} Histogram metric`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      const labels = histogram.labels ? this.formatLabels(histogram.labels) : '';
      lines.push(`${histogram.name}${labels} ${histogram.value}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }

  private formatLabels(labels: Record<string, string>): string {
    const formatted = Object.keys(labels)
      .sort()
      .map(key => `${key}="${labels[key]}"`)
      .join(',');
    
    return `{${formatted}}`;
  }

  // Export metrics as JSON
  exportJSONMetrics(): unknown {
    return {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.metrics.startTime.getTime(),
      counters: Array.from(this.metrics.counters.values()),
      gauges: Array.from(this.metrics.gauges.values()),
      histograms: Array.from(this.metrics.histograms.values())
    };
  }

  // Reset all metrics
  reset(): void {
    this.metrics.counters.clear();
    this.metrics.gauges.clear();
    this.metrics.histograms.clear();
    this.metrics.startTime = new Date();
  }

  // Get summary statistics
  getSummary(): {
    totalCounters: number;
    totalGauges: number;
    totalHistograms: number;
    uptime: number;
  } {
    return {
      totalCounters: this.metrics.counters.size,
      totalGauges: this.metrics.gauges.size,
      totalHistograms: this.metrics.histograms.size,
      uptime: Date.now() - this.metrics.startTime.getTime()
    };
  }
}

// Global metrics registry
export class MetricsRegistry {
  private static collectors: Map<string, MetricsCollector> = new Map();

  static getCollector(serviceName: string): MetricsCollector {
    if (!this.collectors.has(serviceName)) {
      this.collectors.set(serviceName, new MetricsCollector(serviceName));
    }
    return this.collectors.get(serviceName)!;
  }

  static getAllCollectors(): MetricsCollector[] {
    return Array.from(this.collectors.values());
  }

  static exportAllMetrics(): string {
    return this.getAllCollectors()
      .map(collector => collector.exportPrometheusMetrics())
      .join('\n');
  }

  static exportAllMetricsJSON(): unknown {
    return {
      timestamp: new Date().toISOString(),
      services: this.getAllCollectors().map(collector => collector.exportJSONMetrics())
    };
  }
}