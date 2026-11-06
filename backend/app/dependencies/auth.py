from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import ssl
import certifi

from app.core.config import settings

security = HTTPBearer()

jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

ssl_context = ssl.create_default_context(
    cafile=certifi.where()
)

jwks_client = jwt.PyJWKClient(
    jwks_url,
    ssl_context=ssl_context
)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    try:
        # Inspect JWT header (without verifying)
        header = jwt.get_unverified_header(token)

        print("JWT Algorithm:", header.get("alg"))
        print("JWT Key ID:", header.get("kid"))

        # Get Supabase public signing key
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        print("Signing key retrieved successfully")

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1"
        )

        print("JWT verification successful")

        return {
            "id": payload["sub"],
            "email": payload.get("email")
        }

    except jwt.ExpiredSignatureError:
        print("ERROR: Token has expired")

    except jwt.InvalidAudienceError:
        print("ERROR: Invalid audience")

    except jwt.InvalidIssuerError:
        print("ERROR: Invalid issuer")

    except jwt.InvalidSignatureError:
        print("ERROR: Invalid signature")

    except jwt.PyJWTError as e:
        print("JWT ERROR:", type(e).__name__, str(e))

    raise HTTPException(
        status_code=401,
        detail="Invalid or expired token"
    )