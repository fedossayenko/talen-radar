#!/bin/sh
# TalentRadar API Docker Entrypoint Script
# Enhanced script with xvfb pre-flight checks and system health validation

set -e

echo "Starting TalentRadar API container..."
echo "Container startup time: $(date '+%Y-%m-%d %H:%M:%S')"

# System health and pre-flight checks
perform_preflight_checks() {
    echo "Performing system pre-flight checks..."
    
    # Check available disk space
    df -h /tmp | tail -1 | awk '{print "Available disk space in /tmp: "$4}'
    
    # Check available memory
    if command -v free > /dev/null 2>&1; then
        free -h | head -2
    fi
    
    # Verify xvfb installation unless disabled
    if [ "$DISABLE_XVFB" != "true" ]; then
        echo "Checking Xvfb installation..."
        if ! command -v Xvfb > /dev/null 2>&1; then
            echo "WARNING: Xvfb not found in PATH"
        else
            echo "Xvfb found: $(which Xvfb)"
        fi
        
        # Check for xdpyinfo (required for display verification)
        if ! command -v xdpyinfo > /dev/null 2>&1; then
            echo "WARNING: xdpyinfo not found - installing x11-utils..."
            apt-get update -qq && apt-get install -qq x11-utils || echo "Failed to install x11-utils"
        fi
    fi
    
    echo "Pre-flight checks completed"
}

# Setup system directories and permissions
setup_system_environment() {
    echo "Setting up system environment..."
    
    # Wait for database file directory to exist
    echo "Ensuring database directory exists..."
    mkdir -p /app/data
    chmod -R 755 /app/data
    
    # Setup X11 directories with proper permissions (even if xvfb disabled for consistency)
    mkdir -p /tmp/.X11-unix
    chmod 1777 /tmp/.X11-unix
    
    # Create logs directory
    mkdir -p /tmp/logs
    chmod 755 /tmp/logs
    
    # Clean up any stale processes or files from previous runs
    echo "Cleaning up stale X11 resources..."
    rm -f /tmp/.X*-lock 2>/dev/null || true
    rm -f /tmp/.X11-unix/X* 2>/dev/null || true
    
    # Kill any orphaned Xvfb processes
    if pgrep Xvfb > /dev/null 2>&1; then
        echo "Killing orphaned Xvfb processes..."
        pkill Xvfb || true
        sleep 1
    fi
    
    echo "System environment setup completed"
}

# Database initialization
initialize_database() {
    echo "Initializing database..."
    
    # Change to API directory for Prisma operations
    cd /app/apps/api
    
    # Generate Prisma client
    echo "Generating Prisma client..."
    npx prisma generate
    
    # Run database migrations
    echo "Running database migrations..."
    npx prisma migrate deploy
    
    # Seed database if in development mode
    if [ "$NODE_ENV" = "development" ]; then
        echo "Seeding database for development..."
        npx prisma db seed || echo "Seeding failed or no seed script found"
    fi
    
    echo "Database initialization completed"
}

# Validate xvfb configuration
validate_xvfb_config() {
    if [ "$DISABLE_XVFB" = "true" ]; then
        echo "Xvfb disabled via DISABLE_XVFB environment variable"
        return 0
    fi
    
    echo "Validating Xvfb configuration..."
    
    # Display configuration info
    DISPLAY_NUM=${XVFB_DISPLAY:-99}
    SCREEN_RESOLUTION=${XVFB_RESOLUTION:-1920x1080x24}
    
    echo "Xvfb display number: :${DISPLAY_NUM}"
    echo "Xvfb screen resolution: ${SCREEN_RESOLUTION}"
    echo "Xvfb max retries: ${XVFB_MAX_RETRIES:-3}"
    echo "Xvfb startup timeout: ${XVFB_STARTUP_TIMEOUT:-5}s"
    echo "Fallback to headless: ${XVFB_FALLBACK_HEADLESS:-true}"
    
    # Check if display is already in use
    if [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
        echo "WARNING: Display :${DISPLAY_NUM} socket already exists, will be cleaned up"
    fi
    
    if [ -f "/tmp/.X${DISPLAY_NUM}-lock" ]; then
        echo "WARNING: Display :${DISPLAY_NUM} lock file exists, will be cleaned up"
    fi
    
    echo "Xvfb configuration validation completed"
}

# Main initialization sequence
main() {
    perform_preflight_checks
    setup_system_environment
    initialize_database
    validate_xvfb_config
    
    echo "=== Container initialization completed ==="
    echo "Starting application..."
    
    # Check if DISABLE_XVFB is set to skip virtual display
    if [ "$DISABLE_XVFB" = "true" ]; then
        echo "Running application without virtual display..."
        exec "$@"
    else
        echo "Starting application with enhanced xvfb virtual display support..."
        exec xvfb-wrapper.sh "$@"
    fi
}

# Run main initialization
main "$@"