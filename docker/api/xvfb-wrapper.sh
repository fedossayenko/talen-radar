#!/bin/bash

# xvfb-wrapper.sh - Enhanced virtual display wrapper for headful browser automation
# This script starts Xvfb (X Virtual Framebuffer) with robust error handling,
# logging, and recovery mechanisms for Docker containers

# Configuration
DISPLAY_NUM=${XVFB_DISPLAY:-99}
SCREEN_RESOLUTION=${XVFB_RESOLUTION:-1920x1080x24}
MAX_RETRIES=${XVFB_MAX_RETRIES:-3}
STARTUP_TIMEOUT=${XVFB_STARTUP_TIMEOUT:-5}
LOG_FILE=${XVFB_LOG_FILE:-/tmp/xvfb.log}
FALLBACK_TO_HEADLESS=${XVFB_FALLBACK_HEADLESS:-true}

# Logging function
log() {
    echo "[xvfb-wrapper] $(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "${LOG_FILE}"
}

log "Starting enhanced Xvfb wrapper"
log "Configuration: display=:${DISPLAY_NUM}, resolution=${SCREEN_RESOLUTION}, retries=${MAX_RETRIES}"

# Cleanup function for Xvfb processes and lock files
cleanup_xvfb() {
    log "Performing Xvfb cleanup..."
    
    # Kill any existing Xvfb processes on this display
    if pgrep -f "Xvfb.*:${DISPLAY_NUM}" > /dev/null 2>&1; then
        log "Killing existing Xvfb processes on display :${DISPLAY_NUM}"
        pkill -f "Xvfb.*:${DISPLAY_NUM}" || true
        sleep 1
    fi
    
    # Remove stale lock files
    if [ -f "/tmp/.X${DISPLAY_NUM}-lock" ]; then
        log "Removing stale lock file: /tmp/.X${DISPLAY_NUM}-lock"
        rm -f "/tmp/.X${DISPLAY_NUM}-lock" || true
    fi
    
    # Clean up socket files
    if [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
        log "Removing stale socket: /tmp/.X11-unix/X${DISPLAY_NUM}"
        rm -f "/tmp/.X11-unix/X${DISPLAY_NUM}" || true
    fi
}

# Initialize required directories
setup_directories() {
    log "Setting up required directories..."
    
    # Create /tmp/.X11-unix directory with proper permissions
    if [ ! -d "/tmp/.X11-unix" ]; then
        mkdir -p "/tmp/.X11-unix"
        chmod 1777 "/tmp/.X11-unix"
        log "Created /tmp/.X11-unix directory"
    fi
    
    # Create log directory
    mkdir -p "$(dirname "${LOG_FILE}")"
    touch "${LOG_FILE}"
}

# Start Xvfb with retry logic
start_xvfb() {
    local attempt=1
    local xvfb_pid=0
    
    while [ $attempt -le $MAX_RETRIES ]; do
        log "Xvfb startup attempt ${attempt}/${MAX_RETRIES}"
        
        # Clean up any existing processes/files
        cleanup_xvfb
        
        # Start Xvfb with full logging
        log "Starting Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_RESOLUTION}"
        Xvfb :${DISPLAY_NUM} \
            -screen 0 ${SCREEN_RESOLUTION} \
            -ac \
            +extension GLX \
            +extension RANDR \
            +extension RENDER \
            -noreset \
            -nolisten tcp \
            >> "${LOG_FILE}" 2>&1 &
        
        xvfb_pid=$!
        log "Xvfb started with PID: ${xvfb_pid}"
        
        # Wait for Xvfb to initialize
        log "Waiting ${STARTUP_TIMEOUT} seconds for Xvfb to start..."
        sleep $STARTUP_TIMEOUT
        
        # Check if Xvfb is still running
        if kill -0 ${xvfb_pid} 2>/dev/null; then
            # Verify X server is responsive
            if xdpyinfo -display :${DISPLAY_NUM} > /dev/null 2>&1; then
                log "Xvfb successfully started and responsive on display :${DISPLAY_NUM}"
                export DISPLAY=:${DISPLAY_NUM}
                
                # Set cleanup trap for this PID
                trap "log 'Cleaning up Xvfb process ${xvfb_pid}'; kill ${xvfb_pid} 2>/dev/null || true" EXIT INT TERM
                
                # Store PID for later use and return success
                XVFB_PID=${xvfb_pid}
                return 0
            else
                log "WARNING: Xvfb started but not responsive, checking logs..."
                tail -10 "${LOG_FILE}" | while read line; do log "XVFB: $line"; done
            fi
        else
            log "ERROR: Xvfb process ${xvfb_pid} exited during startup"
            log "Last few lines from Xvfb log:"
            tail -10 "${LOG_FILE}" 2>/dev/null | while read line; do log "XVFB: $line"; done
        fi
        
        # Clean up failed attempt
        kill ${xvfb_pid} 2>/dev/null || true
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            local wait_time=$((attempt * 2))
            log "Retrying in ${wait_time} seconds..."
            sleep $wait_time
        fi
        
        attempt=$((attempt + 1))
    done
    
    return 1  # All attempts failed
}

# Fallback to headless mode
fallback_headless() {
    log "WARNING: All Xvfb attempts failed"
    
    if [ "${FALLBACK_TO_HEADLESS}" = "true" ]; then
        log "Falling back to headless browser mode"
        export SCRAPER_FORCE_HEADLESS=true
        export PLAYWRIGHT_HEADLESS=true
        log "Set SCRAPER_FORCE_HEADLESS=true and PLAYWRIGHT_HEADLESS=true"
        return 0
    else
        log "FATAL: Xvfb failed and headless fallback disabled"
        return 1
    fi
}

# Main execution
main() {
    setup_directories
    
    if start_xvfb; then
        log "Xvfb setup completed successfully"
        log "DISPLAY=${DISPLAY}"
        log "Executing command: $@"
        exec "$@"
    else
        if fallback_headless; then
            log "Proceeding with headless fallback"
            log "Executing command: $@"
            exec "$@"
        else
            log "FATAL: Cannot start Xvfb and headless fallback disabled"
            exit 1
        fi
    fi
}

# Run main function
main "$@"