import json
from typing import Iterable

from app.models.user import User

PERMISSION_DEFINITIONS = [
    {"code": "tasks.manage", "label": "Criar e editar tarefas"},
    {"code": "routines.manage", "label": "Gerenciar rotinas"},
    {"code": "deliveries.manage", "label": "Gerenciar entregas"},
    {"code": "pickups.manage", "label": "Gerenciar retiradas de materiais"},
    {"code": "pickups.create_order", "label": "Ordem de retirada"},
    {"code": "pickups.import_base", "label": "Atualizar base de retiradas"},
    {"code": "pickups.orders_history", "label": "Historico de ordens"},
    {"code": "pickups.withdrawals_history", "label": "Historico de retiradas"},
    {"code": "comodatos.view", "label": "Dashboard de comodatos"},
]
ALLOWED_PERMISSIONS = {item["code"] for item in PERMISSION_DEFINITIONS}


def parse_permissions(raw_permissions: object) -> list[str]:
    if raw_permissions is None:
        return []

    if isinstance(raw_permissions, list):
        source = raw_permissions
    elif isinstance(raw_permissions, str):
        text = raw_permissions.strip()
        if not text:
            return []
        try:
            decoded = json.loads(text)
        except json.JSONDecodeError:
            return []
        if not isinstance(decoded, list):
            return []
        source = decoded
    else:
        return []

    result: list[str] = []
    seen: set[str] = set()
    for item in source:
        permission = str(item or "").strip()
        if not permission:
            continue
        if permission not in ALLOWED_PERMISSIONS:
            continue
        if permission in seen:
            continue
        seen.add(permission)
        result.append(permission)
    return sorted(result)


def serialize_permissions(permissions: Iterable[str] | None) -> str:
    return json.dumps(parse_permissions(list(permissions or [])), ensure_ascii=False)


def permissions_for_user(user: User | None) -> list[str]:
    if not user:
        return []
    if str(getattr(user, "role", "")).strip() == "admin":
        return sorted(ALLOWED_PERMISSIONS)
    return parse_permissions(getattr(user, "permissions", "[]"))


def has_permission(user: User | None, permission: str) -> bool:
    required_permission = str(permission or "").strip()
    if not required_permission:
        return False
    return required_permission in permissions_for_user(user)
