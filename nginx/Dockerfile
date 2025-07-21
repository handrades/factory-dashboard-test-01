FROM nginx:1.25-alpine

# Install security updates and OpenSSL for certificate generation
RUN apk update && apk upgrade && \
    apk add --no-cache openssl && \
    rm -rf /var/cache/apk/*

# nginx user and group already exist in base image

# Create SSL directory
RUN mkdir -p /etc/nginx/ssl

# Generate self-signed certificate for development
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/nginx-selfsigned.key \
    -out /etc/nginx/ssl/nginx-selfsigned.crt \
    -subj "/C=US/ST=Factory/L=Dashboard/O=Security/OU=Development/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:factory-dashboard.local,IP:127.0.0.1"

# Set proper permissions for SSL files
RUN chmod 600 /etc/nginx/ssl/nginx-selfsigned.key && \
    chmod 644 /etc/nginx/ssl/nginx-selfsigned.crt && \
    chown -R nginx:nginx /etc/nginx/ssl

# Copy custom nginx configuration
COPY nginx-secure.conf /etc/nginx/conf.d/default.conf

# Create custom error pages directory
RUN mkdir -p /usr/share/nginx/html

# Copy custom error pages
COPY 403.html 404.html 50x.html /usr/share/nginx/html/

# Set proper permissions for error pages
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 644 /usr/share/nginx/html/*

# Create log directory and set permissions
RUN mkdir -p /var/log/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chmod -R 755 /var/log/nginx

# Note: nginx -t is skipped during build as upstream hosts don't exist yet

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f https://localhost/health --insecure || exit 1

# Switch to non-root user
USER nginx

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]