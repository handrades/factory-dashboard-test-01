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

# Create custom error pages
RUN mkdir -p /usr/share/nginx/html

# Create custom 403 page
RUN cat > /usr/share/nginx/html/403.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Access Forbidden</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .error { color: #d32f2f; }
    </style>
</head>
<body>
    <h1 class="error">403 - Access Forbidden</h1>
    <p>You don't have permission to access this resource.</p>
</body>
</html>
EOF

# Create custom 404 page
RUN cat > /usr/share/nginx/html/404.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Page Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .error { color: #d32f2f; }
    </style>
</head>
<body>
    <h1 class="error">404 - Page Not Found</h1>
    <p>The requested resource could not be found.</p>
</body>
</html>
EOF

# Create custom 50x page
RUN cat > /usr/share/nginx/html/50x.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Server Error</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .error { color: #d32f2f; }
    </style>
</head>
<body>
    <h1 class="error">Server Error</h1>
    <p>Something went wrong. Please try again later.</p>
</body>
</html>
EOF

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