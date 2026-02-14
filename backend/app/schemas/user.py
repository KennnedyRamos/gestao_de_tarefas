from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "assistente"
    permissions: list[str] = Field(default_factory=list)

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    permissions: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class UserPasswordReset(BaseModel):
    password: str


class UserAccessUpdate(BaseModel):
    role: str
    permissions: list[str] = Field(default_factory=list)


class PermissionOptionOut(BaseModel):
    code: str
    label: str
