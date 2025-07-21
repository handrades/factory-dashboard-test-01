#!/bin/bash
# Backup script for credentials
# Store this in a secure location separate from the code repository

BACKUP_DIR="$HOME/.factory-dashboard-backups"
mkdir -p "$BACKUP_DIR"

# Backup with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
cp .env "$BACKUP_DIR/.env_backup_$TIMESTAMP"

echo "Credentials backed up to $BACKUP_DIR/.env_backup_$TIMESTAMP"
echo "Remember to encrypt this backup file!"
