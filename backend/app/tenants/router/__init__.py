# app/tenants/router/__init__.py
from fastapi import APIRouter
from app.tenants.router.auth import router as auth_router
from app.tenants.router.ui_theme import router as ui_theme_router
from app.tenants.router.ui_table_settings import router as ui_table_settings_router  # ← NUEVO
from app.tenants.router.users import router as users_router
from app.tenants.router.admin import router as admin_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(ui_theme_router)
router.include_router(ui_table_settings_router)  # ← NUEVO
router.include_router(users_router)
router.include_router(admin_router)
