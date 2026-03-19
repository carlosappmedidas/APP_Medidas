# app/tenants/routes.py
# Re-export del router principal para que main.py no cambie.
# Toda la lógica vive en app/tenants/router/
from app.tenants.router import router as router  # noqa: PLC0414