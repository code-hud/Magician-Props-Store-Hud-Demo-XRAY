#!/bin/bash
# Start script for the Magician Props API with optional Hud monitoring

# Check if HUD_API_KEY is set
if [ -n "$HUD_API_KEY" ]; then
    echo "Starting with Hud monitoring enabled for service: $SERVICE_NAME"
    exec hud-run \
        --key "$HUD_API_KEY" \
        --service "$SERVICE_NAME" \
        uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-3001}" --reload
else
    echo "HUD_API_KEY not set. Starting without Hud monitoring."
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-3001}" --reload
fi
