#!/bin/bash
# Removed set -e to prevent script from exiting on errors

echo "Starting container..."

# Check if required environment variables are set
if [ -z "${run_id}" ]; then
    echo "Error: 'run_id' environment variable is not set"
    exit 1
fi

if [ -z "${code_server_password}" ]; then
    echo "Error: 'code_server_password' environment variable is not set"
    exit 1
fi

if [ -z "${preview_endpoint}" ]; then
    echo "Error: 'preview_endpoint' environment variable is not set"
    exit 1
fi

if [ -z "${base_url}" ]; then
    echo "Error: 'base_url' environment variable is not set"
    exit 1
fi

if [ -z "${monitor_polling_interval}" ]; then
    echo "Error: 'monitor_polling_interval' environment variable is not set"
    exit 1
fi

# Update frontend environment variables if frontend directory exists
if [ -d "/app/frontend" ]; then
    echo "WDS_SOCKET_PORT=443" > /app/frontend/.env
    echo "REACT_APP_BACKEND_URL=${preview_endpoint}" >> /app/frontend/.env
fi

# Directly set the password in the supervisor config file
sed -i "s|environment=PASSWORD=\".*\"|environment=PASSWORD=\"${code_server_password}\"|" /etc/supervisor/conf.d/supervisord_code_server.conf

nohup e1_monitor ${run_id} ${base_url} --interval ${monitor_polling_interval} > /var/log/monitor.log 2>&1 &

# Handle SIGTERM gracefully
trap 'echo "Received SIGTERM, shutting down..."; kill -TERM $uvicorn_pid 2>/dev/null; exit 0' SIGTERM

# Create log directory for supervisor
mkdir -p /var/log/supervisor

# Start supervisor
( sudo service supervisor start && sudo supervisorctl reread && sudo supervisorctl update ) &

# Start and monitor uvicorn
while true; do
    echo "[$(date)] Starting uvicorn server..."
    uvicorn plugins.tools.agent.server:app --host "0.0.0.0" --port 8010 --workers 1 --no-access-log &
    uvicorn_pid=$!
    echo "[$(date)] Uvicorn started with PID: $uvicorn_pid"
    
    # Wait for the process but don't exit on failure
    wait $uvicorn_pid || true
    exit_code=$?
    echo "[$(date)] Uvicorn process $uvicorn_pid exited with code $exit_code"
    
    # Log the specific signal if it was killed
    if [ $exit_code -gt 128 ]; then
        signal=$((exit_code - 128))
        echo "[$(date)] Process was killed by signal $signal"
    fi
    
    echo "[$(date)] Restarting in 3 seconds..."
    sleep 3
done

