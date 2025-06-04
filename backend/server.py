from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import hashlib


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'minecraft-clone-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create the main app without a prefix
app = FastAPI(title="Crafty Minecraft Clone API", version="2.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# ========== DATA MODELS ==========

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    worlds: List[str] = Field(default_factory=list)

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class World(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    owner_id: str
    world_data: Dict[str, Any]  # Block positions and types
    settings: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_modified: datetime = Field(default_factory=datetime.utcnow)
    is_public: bool = False
    collaborators: List[str] = Field(default_factory=list)

class WorldCreate(BaseModel):
    name: str
    world_data: Dict[str, Any]
    settings: Dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False

class WorldUpdate(BaseModel):
    world_data: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    name: Optional[str] = None
    is_public: Optional[bool] = None

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    world_id: str
    user_id: str
    username: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# ========== UTILITY FUNCTIONS ==========

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

def create_access_token(user_id: str, username: str) -> str:
    expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        username = payload.get("username")
        
        if user_id is None or username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ========== AUTH ENDPOINTS ==========

@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({
        "$or": [{"username": user_data.username}, {"email": user_data.email}]
    })
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Create new user
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(user_data.password)
    )
    
    await db.users.insert_one(user.dict())
    
    # Create access token
    token = create_access_token(user.id, user.username)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    user = await db.users.find_one({"username": login_data.username})
    
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Create access token
    token = create_access_token(user["id"], user["username"])
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    }

@api_router.get("/auth/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "created_at": current_user.created_at,
        "last_login": current_user.last_login,
        "worlds": current_user.worlds
    }

# ========== WORLD MANAGEMENT ENDPOINTS ==========

@api_router.post("/worlds", response_model=Dict[str, Any])
async def create_world(world_data: WorldCreate, current_user: User = Depends(get_current_user)):
    world = World(
        name=world_data.name,
        owner_id=current_user.id,
        world_data=world_data.world_data,
        settings=world_data.settings,
        is_public=world_data.is_public
    )
    
    await db.worlds.insert_one(world.dict())
    
    # Add world to user's world list
    await db.users.update_one(
        {"id": current_user.id},
        {"$push": {"worlds": world.id}}
    )
    
    return {"world_id": world.id, "message": "World created successfully"}

@api_router.get("/worlds", response_model=List[Dict[str, Any]])
async def get_user_worlds(current_user: User = Depends(get_current_user)):
    worlds = await db.worlds.find({
        "$or": [
            {"owner_id": current_user.id},
            {"collaborators": current_user.id},
            {"is_public": True}
        ]
    }).to_list(100)
    
    return [{
        "id": world["id"],
        "name": world["name"],
        "owner_id": world["owner_id"],
        "created_at": world["created_at"],
        "last_modified": world["last_modified"],
        "is_public": world["is_public"],
        "is_owner": world["owner_id"] == current_user.id
    } for world in worlds]

@api_router.get("/worlds/{world_id}")
async def get_world(world_id: str, current_user: User = Depends(get_current_user)):
    world = await db.worlds.find_one({"id": world_id})
    
    if not world:
        raise HTTPException(status_code=404, detail="World not found")
    
    # Check permissions
    if (world["owner_id"] != current_user.id and 
        current_user.id not in world.get("collaborators", []) and 
        not world.get("is_public", False)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return World(**world)

@api_router.put("/worlds/{world_id}")
async def update_world(world_id: str, world_data: WorldUpdate, current_user: User = Depends(get_current_user)):
    world = await db.worlds.find_one({"id": world_id})
    
    if not world:
        raise HTTPException(status_code=404, detail="World not found")
    
    # Check permissions - only owner or collaborators can edit
    if (world["owner_id"] != current_user.id and 
        current_user.id not in world.get("collaborators", [])):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update world data
    update_data = {"last_modified": datetime.utcnow()}
    
    if world_data.world_data is not None:
        update_data["world_data"] = world_data.world_data
    if world_data.settings is not None:
        update_data["settings"] = world_data.settings
    if world_data.name is not None:
        update_data["name"] = world_data.name
    if world_data.is_public is not None:
        update_data["is_public"] = world_data.is_public
    
    await db.worlds.update_one({"id": world_id}, {"$set": update_data})
    
    return {"message": "World updated successfully"}

@api_router.delete("/worlds/{world_id}")
async def delete_world(world_id: str, current_user: User = Depends(get_current_user)):
    world = await db.worlds.find_one({"id": world_id})
    
    if not world:
        raise HTTPException(status_code=404, detail="World not found")
    
    # Only owner can delete
    if world["owner_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can delete world")
    
    await db.worlds.delete_one({"id": world_id})
    
    # Remove from user's world list
    await db.users.update_one(
        {"id": current_user.id},
        {"$pull": {"worlds": world_id}}
    )
    
    return {"message": "World deleted successfully"}

# ========== CHAT ENDPOINTS ==========

@api_router.post("/worlds/{world_id}/chat")
async def send_chat_message(world_id: str, message: str, current_user: User = Depends(get_current_user)):
    # Verify user has access to world
    world = await db.worlds.find_one({"id": world_id})
    if not world:
        raise HTTPException(status_code=404, detail="World not found")
    
    if (world["owner_id"] != current_user.id and 
        current_user.id not in world.get("collaborators", []) and 
        not world.get("is_public", False)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    chat_message = ChatMessage(
        world_id=world_id,
        user_id=current_user.id,
        username=current_user.username,
        message=message
    )
    
    await db.chat_messages.insert_one(chat_message.dict())
    
    return chat_message

@api_router.get("/worlds/{world_id}/chat")
async def get_chat_messages(world_id: str, limit: int = 50, current_user: User = Depends(get_current_user)):
    # Verify user has access to world
    world = await db.worlds.find_one({"id": world_id})
    if not world:
        raise HTTPException(status_code=404, detail="World not found")
    
    if (world["owner_id"] != current_user.id and 
        current_user.id not in world.get("collaborators", []) and 
        not world.get("is_public", False)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    messages = await db.chat_messages.find(
        {"world_id": world_id}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return [ChatMessage(**msg) for msg in reversed(messages)]

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Crafty Minecraft Clone API v2.0", "status": "running"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
