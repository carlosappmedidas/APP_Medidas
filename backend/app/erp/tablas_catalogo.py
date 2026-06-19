"""Registro declarado de las TABLAS AUXILIARES del ERP (listas de valores que usan las pantallas).

NO son las tablas de datos (titular, suministro...), sino las tablas/enums que las alimentan
por debajo (tipo_persona, tipo_identificador, catalogos CNMC, etc.).

Cada entrada declara:
- clave:     identificador unico de la tabla auxiliar
- nombre:    nombre legible
- modulo:    modulo del ERP (ej. "Modulo 1 - Maestro Suministros y Contratos")
- seccion:   pantalla dentro del modulo (Titulares / Suministros / Contratos)
- origen:    "normativa" | "propia"
- normativa: referencia legal + articulo (solo si origen == "normativa"); None si propia
- fuente:    de donde se resuelven los valores:
               ("enum", "<NOMBRE_LABEL_DICT>")  -> dict label de normativa_atr.py
               ("tabla", "<NombreModelo>")        -> tabla BD (modelo SQLAlchemy)

El endpoint /erp/tablas lee este registro y resuelve los valores desde las fuentes ya
existentes (no se duplican datos). Solo lectura por ahora; la edicion llegara con rol superusuario.
"""

REGISTRO_TABLAS = [
    {
        "clave": "tipo_persona",
        "nombre": "Tipo de persona",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "propia",
        "normativa": None,
        "fuente": ("enum", "TIPO_PERSONA_LABEL"),
    },
    {
        "clave": "tipo_identificador",
        "nombre": "Tipo de documento",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "normativa",
        "normativa": "ATR - Tabla 6 (Res. CNMC 16-may-2024)",
        "fuente": ("enum", "TIPO_IDENTIFICADOR_LABEL"),
    },
    {
        "clave": "erp_cnmc_tipo_via",
        "nombre": "Tipo de via",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (tipo de via)",
        "fuente": ("tabla", "ErpCnmcTipoVia"),
    },
    {
        "clave": "erp_cnmc_piso",
        "nombre": "Piso",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (piso)",
        "fuente": ("tabla", "ErpCnmcPiso"),
    },
    {
        "clave": "erp_cnmc_puerta",
        "nombre": "Puerta",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (puerta)",
        "fuente": ("tabla", "ErpCnmcPuerta"),
    },
    {
        "clave": "erp_cnmc_aclarador_finca",
        "nombre": "Tipo de aclarador de finca",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (aclarador de finca)",
        "fuente": ("tabla", "ErpCnmcAclaradorFinca"),
    },
]
