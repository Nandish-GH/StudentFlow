from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
from contextlib import asynccontextmanager
import hashlib
import jwt
from datetime import datetime, timedelta, timezone
import aiosqlite
import uuid
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

print("Open http://localhost:8080/")

# Database path - use /tmp for Google App Engine
DB_PATH = os.getenv("GAE_ENV") and "/tmp/studentflow.db" or "studentflow.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                password TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                content TEXT,
                subject TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                description TEXT,
                subject TEXT,
                priority TEXT,
                status TEXT,
                due_date TEXT,
                estimated_time INTEGER,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                content TEXT,
                likes INTEGER DEFAULT 0,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS post_likes (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT,
                UNIQUE(post_id, user_id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS mood_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                mood_score INTEGER,
                energy_level INTEGER,
                stress_level INTEGER,
                notes TEXT,
                date TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS post_comments (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT,
                FOREIGN KEY(post_id) REFERENCES posts(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)
        await db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="StudentFlow", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "169a765d26005d18dcaf04d2453f37fb")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

security = HTTPBearer()

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Note(BaseModel):
    title: str
    content: str
    subject: Optional[str] = None

class Task(BaseModel):
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[str] = None
    estimated_time: int = 60
    status: str = "pending"

class Post(BaseModel):
    title: str
    content: str

class PostComment(BaseModel):
    content: str

class MoodLog(BaseModel):
    mood_score: int
    energy_level: Optional[int] = None
    stress_level: Optional[int] = None
    notes: Optional[str] = None

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload["user_id"]
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/auth/register")
async def register(user: UserRegister):
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user.password)
    
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, user.email, hashed_pw, user.first_name, user.last_name, datetime.now(timezone.utc).isoformat())
            )
            await db.commit()
        except:
            raise HTTPException(status_code=400, detail="Email already exists")
    
    return {"access_token": create_token(user_id)}

@app.post("/api/auth/login")
async def login(user: UserLogin):
    hashed_pw = hash_password(user.password)
    
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id FROM users WHERE email = ? AND password = ?",
            (user.email, hashed_pw)
        )
        row = await cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        return {"access_token": create_token(row[0])}

@app.get("/api/notes")
async def get_notes(user_id: str = Depends(get_current_user), limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, title, content, subject, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit)
        )
        rows = await cursor.fetchall()
        return [{"id": r[0], "title": r[1], "content": r[2], "subject": r[3], "created_at": r[4]} for r in rows]

@app.post("/api/notes")
async def create_note(note: Note, user_id: str = Depends(get_current_user)):
    note_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO notes (id, user_id, title, content, subject, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (note_id, user_id, note.title, note.content, note.subject, datetime.now(timezone.utc).isoformat())
        )
        await db.commit()
    return {"id": note_id}

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user_id))
        await db.commit()
    return {"success": True}

@app.get("/api/study/tasks")
async def get_tasks(user_id: str = Depends(get_current_user), status: str = "all", limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        if status == "all":
            cursor = await db.execute(
                "SELECT id, title, description, subject, priority, due_date, estimated_time, status, created_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
        else:
            cursor = await db.execute(
                "SELECT id, title, description, subject, priority, due_date, estimated_time, status, created_at FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, status, limit)
            )
        rows = await cursor.fetchall()
        return [{"id": r[0], "title": r[1], "description": r[2], "subject": r[3], "priority": r[4], "due_date": r[5], "estimated_time": r[6], "status": r[7], "created_at": r[8]} for r in rows]

@app.post("/api/study/tasks")
async def create_task(task: Task, user_id: str = Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (task_id, user_id, task.title, task.description, task.subject, task.priority, task.status, task.due_date, task.estimated_time, datetime.now(timezone.utc).isoformat())
        )
        await db.commit()
    return {"id": task_id}

@app.put("/api/study/tasks/{task_id}")
async def update_task(task_id: str, task: Task, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE tasks SET title=?, description=?, subject=?, priority=?, due_date=?, estimated_time=?, status=? WHERE id=? AND user_id=?",
            (task.title, task.description, task.subject, task.priority, task.due_date, task.estimated_time, task.status, task_id, user_id)
        )
        await db.commit()
    return {"success": True}

@app.delete("/api/study/tasks/{task_id}")
async def delete_task(task_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        await db.commit()
    return {"success": True}

@app.get("/api/community/posts")
async def get_posts(user_id: str = Depends(get_current_user), limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            SELECT p.id,
                   p.title,
                   p.content,
                   u.email,
                   u.first_name,
                   u.last_name,
                   p.user_id,
                   p.created_at,
                   (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
                   EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) AS liked
            FROM posts p
            LEFT JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            LIMIT ?
            """,
            (user_id, limit)
        )
        rows = await cursor.fetchall()
        posts = []
        for r in rows:
            posts.append({
                "id": r[0],
                "title": r[1],
                "content": r[2],
                "author_email": r[3],
                "author_first_name": r[4],
                "author_last_name": r[5],
                "author_id": r[6],
                "created_at": r[7],
                "likes": r[8],
                "liked": bool(r[9]),
                "can_delete": r[6] == user_id
            })
        return {"posts": posts}

@app.post("/api/community/posts")
async def create_post(post: Post, user_id: str = Depends(get_current_user)):
    post_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO posts (id, user_id, title, content, likes, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (post_id, user_id, post.title, post.content, datetime.now(timezone.utc).isoformat())
        )
        await db.commit()
    return {"id": post_id}

@app.delete("/api/community/posts/{post_id}")
async def delete_post(post_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT user_id FROM posts WHERE id = ?", (post_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Not allowed to delete this post")

        await db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        await db.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
        await db.commit()
    return {"success": True}

@app.post("/api/community/posts/{post_id}/like")
async def like_post(post_id: str, user_id: str = Depends(get_current_user)):
    like_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT id FROM posts WHERE id = ?", (post_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Post not found")

        try:
            await db.execute(
                "INSERT OR IGNORE INTO post_likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                (like_id, post_id, user_id, datetime.now(timezone.utc).isoformat())
            )
            await db.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"success": True}

@app.delete("/api/community/posts/{post_id}/like")
async def unlike_post(post_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM post_likes WHERE post_id = ? AND user_id = ?",
            (post_id, user_id)
        )
        await db.commit()
    return {"success": True}

@app.get("/api/community/posts/{post_id}/comments")
async def get_post_comments(post_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            SELECT c.id, c.content, c.created_at, u.email, u.first_name, u.last_name, c.user_id
            FROM post_comments c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
            """,
            (post_id,)
        )
        rows = await cursor.fetchall()
        comments = []
        for r in rows:
            comments.append({
                "id": r[0],
                "content": r[1],
                "created_at": r[2],
                "author_email": r[3],
                "author_first_name": r[4],
                "author_last_name": r[5],
                "can_delete": r[6] == user_id
            })
        return {"comments": comments}

@app.post("/api/community/posts/{post_id}/comments")
async def create_comment(post_id: str, comment: PostComment, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        # Verify post exists
        cur = await db.execute("SELECT id FROM posts WHERE id = ?", (post_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Post not found")
        
        comment_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO post_comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (comment_id, post_id, user_id, comment.content, datetime.now(timezone.utc).isoformat())
        )
        await db.commit()
    return {"id": comment_id}

@app.delete("/api/community/posts/{post_id}/comments/{comment_id}")
async def delete_comment(post_id: str, comment_id: str, user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT user_id FROM post_comments WHERE id = ? AND post_id = ?", (comment_id, post_id))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Comment not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Not allowed to delete this comment")
        
        await db.execute("DELETE FROM post_comments WHERE id = ?", (comment_id,))
        await db.commit()
    return {"success": True}

@app.get("/api/wellbeing/mood-logs")
async def get_mood_logs(user_id: str = Depends(get_current_user), limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, mood_score, energy_level, stress_level, notes, date FROM mood_logs WHERE user_id = ? ORDER BY date DESC LIMIT ?",
            (user_id, limit)
        )
        rows = await cursor.fetchall()
        return [{"id": r[0], "mood_score": r[1], "energy_level": r[2], "stress_level": r[3], "notes": r[4], "date": r[5]} for r in rows]

@app.post("/api/wellbeing/mood-logs")
async def create_mood_log(mood: MoodLog, user_id: str = Depends(get_current_user)):
    mood_id = str(uuid.uuid4())
    date = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO mood_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (mood_id, user_id, mood.mood_score, mood.energy_level, mood.stress_level, mood.notes, date, date)
        )
        await db.commit()
    return {"id": mood_id}

@app.get("/api/wellbeing/mood-streak")
async def get_mood_streak(user_id: str = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM mood_logs WHERE user_id = ?",
            (user_id,)
        )
        count = (await cursor.fetchone())[0]
        return {"current_streak": min(count, 30)}

@app.post("/api/ai/summarize-notes")
async def summarize_notes(data: dict, user_id: str = Depends(get_current_user)):
    if not GEMINI_API_KEY:
        return {"summary": "⚠️ AI summarization not configured. Please add your Gemini API key to the .env file."}
    
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        prompt = f"Provide a clear, concise summary of the following notes in 2-3 sentences. Focus on the main points and key takeaways:\n\n{data.get('content', '')}"
        response = model.generate_content(prompt)
        return {"summary": response.text.strip()}
    except Exception as e:
        return {"summary": f"Error generating summary: {str(e)}"}

@app.post("/api/ai/study-plan")
async def generate_study_plan(data: dict, user_id: str = Depends(get_current_user)):
    if not GEMINI_API_KEY:
        return {"study_plan": "⚠️ AI study plan generation not configured. Please add your Gemini API key to the .env file."}
    
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        subject = data.get('subject', 'General Studies')
        topics = data.get('topics', [])
        timeline = data.get('timeline', 'one week')
        difficulty = data.get('difficulty', 'intermediate')
        
        topics_str = ', '.join([t.strip() for t in topics if t.strip()])
        
        prompt = f"""Create a detailed study plan with the following specifications:

Subject: {subject}
Topics to cover: {topics_str}
Timeline: {timeline}
Difficulty level: {difficulty}

Please provide:
1. A day-by-day breakdown of what to study
2. Recommended time allocation for each topic
3. Study methods and techniques
4. Practice exercises or activities
5. Tips for retaining information

Format the plan clearly with headers and bullet points."""
        
        response = model.generate_content(prompt)
        return {"study_plan": response.text.strip()}
    except Exception as e:
        return {"study_plan": f"Error generating study plan: {str(e)}"}

@app.post("/api/ai/chat")
async def ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI not configured. Set GOOGLE_API_KEY in .env")

    message = data.get("message", "").strip()
    history = data.get("context", [])
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        history_text = "\n".join([
            (f"User: {m['content']}" if m.get('role') == 'user' else f"Assistant: {m.get('content','')}")
            for m in history[-6:]
        ])
        prompt = f"""You are Scholar OS's helpful study assistant.
Keep answers concise and helpful for students.

{history_text}
User: {message}
Assistant:"""

        resp = model.generate_content(prompt)
        return {"response": resp.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/favicon.ico")
async def favicon():
    # Serve the app logo as favicon so browsers requesting /favicon.ico don't 404.
    candidate = os.path.join("frontend", "assets", "favicon.png")
    alt = os.path.join("frontend", "assets", "logo.png")
    if os.path.exists(candidate):
        return FileResponse(candidate, media_type="image/png")
    if os.path.exists(alt):
        return FileResponse(alt, media_type="image/png")
    # fallback 404
    raise HTTPException(status_code=404, detail="favicon not found")

# Mount static files (frontend)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)