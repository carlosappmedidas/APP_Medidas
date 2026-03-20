# APP Medidas — Backend

API REST para el seguimiento y análisis de medidas eléctricas a nivel de distribución.
Construida con FastAPI + SQLAlchemy sobre PostgreSQL.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | FastAPI 0.128 |
| ORM | SQLAlchemy 2.0 (síncrono) |
| Migraciones | Alembic |
| Base de datos | PostgreSQL |
| Validación | Pydantic v2 + pydantic-settings |
| Auth | JWT con python-jose (roles: owner, admin, user, superuser) |
| Passwords | passlib pbkdf2_sha256 |
| Procesamiento | Pandas + NumPy |
| Servidor | Uvicorn |

---

## Requisitos previos

- Python 3.11+
- PostgreSQL en ejecución
- Base de datos y usuario creados

---

## Instalación
```bash
cd backend

# Crear entorno virtual
python -m venv .venv

# Activar (Mac/Linux)
source .venv/bin/activate

# Activar (Windows)
.venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

---

## Variables de entorno

Copia `.env.example` a `.env` y edita los valores:
```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://user:pass@localhost:5432/app_medidas` |
| `ENV` | Entorno (`dev` / `prod`) | `dev` |
| `SECRET_KEY` | Clave secreta JWT — cámbiala siempre | cadena larga y aleatoria |
| `ALGORITHM` | Algoritmo JWT | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Expiración del token en minutos | `60` |
| `INGESTION_DELETE_AFTER_OK` | Borrar ficheros procesados correctamente | `true` en servidor, `false` en dev |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma. Si está vacío usa los defaults de desarrollo (`localhost:3000`, `127.0.0.1:3000`) | `http://100.106.206.66:3000` |

---

## Migraciones
```bash
# Aplicar migraciones pendientes
alembic upgrade head

# Crear nueva migración (tras cambiar modelos)
alembic revision --autogenerate -m "descripcion del cambio"
```

---

## Arranque
```bash
# Desarrollo (con recarga automática)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Producción
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

API disponible en: `http://localhost:8000`
Documentación interactiva: `http://localhost:8000/docs`
Healthcheck: `http://localhost:8000/health`

---

## Crear superusuario inicial
```bash
python scripts/create_superadmin.py
```

---

## Verificar compilación antes de desplegar
```bash
python -m compileall app
```

---

## Estructura
```
backend/
├── alembic/                  ← migraciones de BD
├── app/
│   ├── core/                 ← config, db, auth, security, models_base
│   ├── tenants/              ← auth, usuarios, multi-tenant, tema UI
│   ├── empresas/             ← gestión de empresas
│   ├── measures/             ← modelos y procesamiento de medidas
│   │   └── router/           ← sub-routers de medidas
│   ├── ingestion/            ← ingesta y parseo de ficheros
│   │   └── parsers/          ← parsers por tipo (M1, BALD, PS, ACUMCIL, H2)
│   ├── alerts/               ← sistema de alertas configurables
│   ├── dashboard/            ← endpoints de métricas y gráficas
│   ├── static/plantillas/    ← plantillas de ficheros descargables
│   └── main.py               ← entrada FastAPI + CORS + routers
├── scripts/                  ← utilidades (create_superadmin, etc.)
├── tests/
├── .env.example
├── alembic.ini
└── requirements.txt
```

---

## Tipos de ficheros soportados

| Tipo | Descripción |
|------|-------------|
| M1 | Medidas horarias de energía generada/consumida |
| BALD | Medidas agregadas por ventanas de publicación (M2, M7, M11, ART15) |
| PS | Punto de Suministro — distribución con tarifas 2.0TD, 3.0TD, 6.xTD |
| ACUMCIL | Acumulados de generación |
| H2 (GEN/GRD/RDD) | Acumulados de energía frontera |

---

## Despliegue en Windows (producción actual)
```powershell
cd C:\Users\corti\APP_Medidas\backend
.venv\Scripts\activate
python -m compileall app
uvicorn app.main:app --host 0.0.0.0 --port 8000
```