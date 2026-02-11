#!/bin/bash
# Start script for the Magician Props API with optional Hud monitoring

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "Waiting for PostgreSQL at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
    MAX_RETRIES=30
    RETRY_INTERVAL=2

    for i in $(seq 1 $MAX_RETRIES); do
        if python -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('${DB_HOST:-postgres}', ${DB_PORT:-5432})); s.close()" 2>/dev/null; then
            echo "PostgreSQL is ready!"
            return 0
        fi
        echo "Attempt $i/$MAX_RETRIES - PostgreSQL not ready, retrying in ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
    done

    echo "WARNING: PostgreSQL may not be ready, starting anyway..."
    return 1
}

wait_for_postgres

# Check if HUD_API_KEY is set
if [ -n "$HUD_API_KEY" ]; then
    echo "Starting with Hud monitoring enabled for service: $SERVICE_NAME"
    exec hud-run \
        --key "$HUD_API_KEY" \
        --service "$SERVICE_NAME" \
        --config ./hud_config.py \
        uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-3001}"
else
    echo "HUD_API_KEY not set. Starting without Hud monitoring."
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-3001}"
fi
