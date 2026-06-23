"""Registro declarado de las TABLAS AUXILIARES del ERP (listas de valores que usan las pantallas).

NO son las tablas de datos (titular, suministro...), sino las tablas/enums que las alimentan
por debajo (tipo_persona, tipo_identificador, catalogos CNMC, etc.).

Cada entrada declara:
- clave:     identificador unico de la tabla auxiliar
- nombre:    nombre legible
- modulo:    modulo del ERP (ej. "Modulo 1 - Maestro Suministros y Contratos")
- seccion:   agrupador dentro del modulo (Titulares / Direccion (CNMC) / Suministros / Contratos)
- usado_por: lista de pantallas que consumen esta tabla (declarada a mano)
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
        "usado_por": ["Titulares"],
        "origen": "propia",
        "normativa": None,
        "fuente": ("enum", "TIPO_PERSONA_LABEL"),
    },
    {
        "clave": "tipo_identificador",
        "nombre": "Tipo de documento",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Titulares",
        "usado_por": ["Titulares"],
        "origen": "normativa",
        "normativa": "ATR - Tabla 6 (Res. CNMC 16-may-2024)",
        "fuente": ("enum", "TIPO_IDENTIFICADOR_LABEL"),
    },
    {
        "clave": "erp_cnmc_tipo_via",
        "nombre": "Tipo de via",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Direccion (CNMC)",
        "usado_por": ["Titulares", "Suministros"],
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (tipo de via)",
        "fuente": ("tabla", "ErpCnmcTipoVia"),
    },
    {
        "clave": "erp_cnmc_piso",
        "nombre": "Piso",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Direccion (CNMC)",
        "usado_por": ["Titulares", "Suministros"],
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (piso)",
        "fuente": ("tabla", "ErpCnmcPiso"),
    },
    {
        "clave": "erp_cnmc_puerta",
        "nombre": "Puerta",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Direccion (CNMC)",
        "usado_por": ["Titulares", "Suministros"],
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (puerta)",
        "fuente": ("tabla", "ErpCnmcPuerta"),
    },
    {
        "clave": "erp_cnmc_aclarador_finca",
        "nombre": "Tipo de aclarador de finca",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Direccion (CNMC)",
        "usado_por": ["Titulares", "Suministros"],
        "origen": "normativa",
        "normativa": "CNMC - formato SIPS (aclarador de finca)",
        "fuente": ("tabla", "ErpCnmcAclaradorFinca"),
    },
    {
        "clave": "tipo_contrato_atr",
        "nombre": "Tipo de contrato ATR",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Contratos",
        "usado_por": ["Contratos"],
        "origen": "normativa",
        "normativa": "RD 88/2026 (+ guia ATR Directo Web)",
        "fuente": ("enum", "TIPO_CONTRATO_ATR_LABEL"),
    },
    {
        "clave": "modo_control_potencia",
        "nombre": "Modo de control de potencia",
        "modulo": "Modulo 1 - Maestro de Suministros y Contratos",
        "seccion": "Contratos",
        "usado_por": ["Contratos"],
        "origen": "normativa",
        "normativa": "CNMC Circular 3/2020 (maximetro > 15 kW)",
        "fuente": ("enum", "MODO_CONTROL_POTENCIA_LABEL"),
    },
    {
        "clave": "erp_cnmc_tipo_punto_medida",
        "nombre": "Tipo de punto de medida",
        "modulo": "Modulo 2 - Equipos de medida",
        "seccion": "Equipo",
        "usado_por": ["Equipos de medida"],
        "origen": "normativa",
        "normativa": "CNMC tabla 30 / RPUM RD 1110/2007 (SOLO REFERENCIA: se calcula por potencia)",
        "fuente": ("tabla", "ErpCnmcTipoPuntoMedida"),
    },
    {
        "clave": "erp_cnmc_propiedad_aparato",
        "nombre": "Tipo de propiedad del aparato",
        "modulo": "Modulo 2 - Equipos de medida",
        "seccion": "Equipo",
        "usado_por": ["Equipos de medida"],
        "origen": "normativa",
        "normativa": "CNMC tabla 32 (formato SIPS - propiedad equipo / ICP)",
        "fuente": ("tabla", "ErpCnmcPropiedadAparato"),
    },
    {
        "clave": "erp_cnmc_telegestion",
        "nombre": "Tipo de telegestion",
        "modulo": "Modulo 2 - Equipos de medida",
        "seccion": "Equipo",
        "usado_por": ["Equipos de medida"],
        "origen": "normativa",
        "normativa": "CNMC tabla 111 (formato SIPS - codigoTelegestion)",
        "fuente": ("tabla", "ErpCnmcTelegestion"),
    },
]
