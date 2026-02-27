from passlib.hash import pbkdf2_sha256


def get_password_hash(password: str) -> str:
    """
    Devuelve el hash seguro de una contraseña en texto plano.
    """
    return pbkdf2_sha256.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Comprueba si una contraseña en texto plano coincide con su hash.
    """
    return pbkdf2_sha256.verify(plain_password, hashed_password)