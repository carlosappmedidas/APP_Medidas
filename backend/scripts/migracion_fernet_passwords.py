r"""
Migracion one-shot e idempotente: cifra passwords STG que estén en claro.

Uso (Mac dev o Windows prod):
    cd backend
    source .venv/bin/activate  # Windows: .venv\Scripts\activate
    PYTHONPATH=. python scripts/migracion_fernet_passwords.py
    deactivate

Es idempotente: si la password ya está cifrada (token Fernet válido), no hace nada.
Si el script aborta a mitad por error, hace ROLLBACK — la BD queda intacta.
"""
from app.core.db import SessionLocal
from app.core.crypto import cifrar_password, descifrar_password, es_token_fernet
from sqlalchemy import text


def migrar() -> None:
    db = SessionLocal()
    try:
        rows = list(db.execute(text(
            "SELECT id, empresa_id, nombre, password_cifrado "
            "FROM stg_conexion_empresa "
            "WHERE password_cifrado IS NOT NULL AND password_cifrado <> ''"
        )))
        print(f"Conexiones STG con password no vacía: {len(rows)}")
        print()

        cifradas = 0
        ya_cifradas = 0
        errores = 0

        for r in rows:
            pwd = r.password_cifrado
            etiqueta = f"id={r.id} empresa={r.empresa_id} nombre={r.nombre}"

            if es_token_fernet(pwd):
                ya_cifradas += 1
                print(f"  [SKIP] {etiqueta}: ya cifrada con Fernet")
                continue

            try:
                token = cifrar_password(pwd)
                if descifrar_password(token) != pwd:
                    raise RuntimeError("round-trip falló")
                db.execute(
                    text("UPDATE stg_conexion_empresa SET password_cifrado=:t WHERE id=:i"),
                    {"t": token, "i": r.id},
                )
                cifradas += 1
                print(f"  [CIFRADA] {etiqueta}: pwd_len={len(pwd)} -> token_len={len(token)}")
            except Exception as e:
                errores += 1
                print(f"  [ERROR] {etiqueta}: {type(e).__name__}: {e}")

        print()
        if errores == 0:
            db.commit()
            print(f"COMMIT OK | cifradas_ahora={cifradas} | ya_estaban_cifradas={ya_cifradas} | errores=0")
        else:
            db.rollback()
            print(f"ROLLBACK por {errores} error(es) — no se aplicó nada")
            return

        # Verificación final
        print()
        print("Verificación post-migración:")
        rows2 = list(db.execute(text(
            "SELECT id, password_cifrado FROM stg_conexion_empresa "
            "WHERE password_cifrado IS NOT NULL AND password_cifrado <> ''"
        )))
        for r in rows2:
            ok = es_token_fernet(r.password_cifrado)
            marca = "OK " if ok else "!! "
            print(f"  [{marca}] id={r.id}: es_token_fernet={ok}")
    finally:
        db.close()


if __name__ == "__main__":
    migrar()
