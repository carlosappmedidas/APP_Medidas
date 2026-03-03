from fastapi import APIRouter

from app.measures.router.general import router as general_router
from app.measures.router.ps import router as ps_router

router = APIRouter(prefix="/medidas", tags=["medidas"])

# subrouters
router.include_router(general_router)
router.include_router(ps_router)