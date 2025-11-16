from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
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

# Database path - persistent storage for Cloud Run
DB_PATH = os.getenv("DB_PATH", "studentflow.db")
print(f"[Database] Using database at: {DB_PATH}")

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
        await db.execute("""
            CREATE TABLE IF NOT EXISTS flashcards (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                note_id TEXT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                subject TEXT,
                difficulty TEXT DEFAULT 'medium',
                last_reviewed TEXT,
                times_reviewed INTEGER DEFAULT 0,
                confidence_level INTEGER DEFAULT 0,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS study_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                date TEXT,
                duration INTEGER,
                created_at TEXT,
                UNIQUE(user_id, date)
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
    print("[Startup] Gemini API configured (key length:", len(GEMINI_API_KEY), ")")
else:
    print("[Startup] No Gemini API key found; AI endpoints will return warning messages.")

security = HTTPBearer()

@app.get("/api")
async def api_root():
    return {"name": "StudentFlow API", "version": "1.0", "docs": "/docs"}

@app.get("/healthz")
async def healthz():
    return {"ok": True}

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

class Flashcard(BaseModel):
    question: str
    answer: str
    subject: Optional[str] = None
    difficulty: str = "medium"
    note_id: Optional[str] = None

class StudySession(BaseModel):
    duration: int  # in minutes

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
        model = genai.GenerativeModel('gemini-2.5-flash')
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

Format the response as clean, readable HTML with:
- Use <h2> for main section headings (e.g., "Day 1: Introduction")
- Use <h3> for subsection headings
- Use <ul> and <li> for bullet lists
- Use <p> for paragraphs
- Use <strong> for emphasis
- Use <code> for specific terms or formulas
- Make it visually scannable with proper spacing

Start with a brief overview, then provide the detailed day-by-day plan."""
        
        response = model.generate_content(prompt)
        plan_text = response.text.strip()
        
        # Convert markdown to HTML if AI returns markdown
        import re
        if '##' in plan_text or '**' in plan_text:
            # Convert markdown headings to HTML
            plan_text = re.sub(r'### (.+)', r'<h3>\1</h3>', plan_text)
            plan_text = re.sub(r'## (.+)', r'<h2>\1</h2>', plan_text)
            plan_text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', plan_text)
            plan_text = re.sub(r'- (.+)', r'<li>\1</li>', plan_text)
            # Wrap consecutive <li> tags in <ul>
            plan_text = re.sub(r'(<li>.*?</li>\n)+', r'<ul>\g<0></ul>', plan_text, flags=re.DOTALL)
            # Add paragraph tags
            lines = plan_text.split('\n')
            formatted_lines = []
            for line in lines:
                if line.strip() and not line.startswith('<'):
                    formatted_lines.append(f'<p>{line}</p>')
                else:
                    formatted_lines.append(line)
            plan_text = '\n'.join(formatted_lines)
        
        return {"study_plan": plan_text}
    except Exception as e:
        print(f"[AI Study Plan Error] {type(e).__name__}: {str(e)}")
        return {"study_plan": f"Error generating study plan: {type(e).__name__}: {str(e)}"}

@app.post("/api/ai/chat")
async def ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI not configured. Set GOOGLE_API_KEY in .env")

    message = data.get("message", "").strip()
    history = data.get("context", [])
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
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
        print(f"[AI Chat Error] {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

# ============= FLASHCARDS ENDPOINTS =============

@app.post("/api/flashcards")
async def create_flashcard(flashcard: Flashcard, user_id: str = Depends(get_current_user)):
    """Create a new flashcard"""
    card_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO flashcards (id, user_id, note_id, question, answer, subject, 
               difficulty, times_reviewed, confidence_level, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)""",
            (card_id, user_id, flashcard.note_id, flashcard.question, flashcard.answer,
             flashcard.subject, flashcard.difficulty, now)
        )
        await db.commit()
    
    return {"id": card_id, "message": "Flashcard created successfully"}

@app.get("/api/flashcards")
async def get_flashcards(user_id: str = Depends(get_current_user), subject: Optional[str] = None):
    """Get all flashcards for the user, optionally filtered by subject"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if subject:
            cursor = await db.execute(
                "SELECT * FROM flashcards WHERE user_id = ? AND subject = ? ORDER BY created_at DESC",
                (user_id, subject)
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM flashcards WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,)
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@app.get("/api/flashcards/{card_id}")
async def get_flashcard(card_id: str, user_id: str = Depends(get_current_user)):
    """Get a specific flashcard"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM flashcards WHERE id = ? AND user_id = ?",
            (card_id, user_id)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Flashcard not found")
        return dict(row)

@app.put("/api/flashcards/{card_id}")
async def update_flashcard(card_id: str, flashcard: Flashcard, user_id: str = Depends(get_current_user)):
    """Update a flashcard"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE flashcards SET question = ?, answer = ?, subject = ?, difficulty = ?
               WHERE id = ? AND user_id = ?""",
            (flashcard.question, flashcard.answer, flashcard.subject, flashcard.difficulty, card_id, user_id)
        )
        await db.commit()
        if db.total_changes == 0:
            raise HTTPException(status_code=404, detail="Flashcard not found")
    
    return {"message": "Flashcard updated successfully"}

@app.delete("/api/flashcards/{card_id}")
async def delete_flashcard(card_id: str, user_id: str = Depends(get_current_user)):
    """Delete a flashcard"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM flashcards WHERE id = ? AND user_id = ?", (card_id, user_id))
        await db.commit()
        if db.total_changes == 0:
            raise HTTPException(status_code=404, detail="Flashcard not found")
    
    return {"message": "Flashcard deleted successfully"}

@app.post("/api/flashcards/{card_id}/review")
async def review_flashcard(card_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Mark a flashcard as reviewed and update confidence level"""
    confidence = data.get('confidence', 0)  # 0-5 scale
    now = datetime.now(timezone.utc).isoformat()
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE flashcards 
               SET last_reviewed = ?, times_reviewed = times_reviewed + 1, confidence_level = ?
               WHERE id = ? AND user_id = ?""",
            (now, confidence, card_id, user_id)
        )
        await db.commit()
        if db.total_changes == 0:
            raise HTTPException(status_code=404, detail="Flashcard not found")
    
    return {"message": "Review recorded successfully"}

@app.post("/api/flashcards/generate")
async def generate_flashcards_from_note(data: dict, user_id: str = Depends(get_current_user)):
    """AI-powered: Generate flashcards from a note"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI not configured")
    
    note_id = data.get('note_id')
    count = data.get('count', 5)
    
    # Get the note content
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM notes WHERE id = ? AND user_id = ?",
            (note_id, user_id)
        )
        note_row = await cursor.fetchone()
        if not note_row:
            raise HTTPException(status_code=404, detail="Note not found")
        note = dict(note_row)
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""Based on the following study note, generate exactly {count} flashcards.

Note Title: {note['title']}
Note Content:
{note['content']}

Generate {count} flashcards in this EXACT JSON format (no markdown, no code blocks):
[
  {{"question": "Q1 here", "answer": "A1 here"}},
  {{"question": "Q2 here", "answer": "A2 here"}}
]

Focus on key concepts, definitions, and important facts. Make questions clear and answers concise."""
        
        response = model.generate_content(prompt)
        cards_text = response.text.strip()
        
        # Clean up markdown code blocks if present
        if cards_text.startswith('```'):
            lines = cards_text.split('\n')
            cards_text = '\n'.join([l for l in lines if not l.startswith('```')])
        cards_text = cards_text.strip()
        
        import json
        cards_data = json.loads(cards_text)
        
        # Insert flashcards into database
        now = datetime.now(timezone.utc).isoformat()
        created_ids = []
        
        async with aiosqlite.connect(DB_PATH) as db:
            for card in cards_data[:count]:
                card_id = str(uuid.uuid4())
                await db.execute(
                    """INSERT INTO flashcards (id, user_id, note_id, question, answer, subject, 
                       difficulty, times_reviewed, confidence_level, created_at) 
                       VALUES (?, ?, ?, ?, ?, ?, 'medium', 0, 0, ?)""",
                    (card_id, user_id, note_id, card['question'], card['answer'], note['subject'], now)
                )
                created_ids.append(card_id)
            await db.commit()
        
        return {"message": f"Generated {len(created_ids)} flashcards", "flashcard_ids": created_ids}
    
    except json.JSONDecodeError as e:
        print(f"[Flashcard Gen Error] JSON parse failed: {str(e)}\nResponse: {cards_text}")
        raise HTTPException(status_code=500, detail="AI response parsing failed")
    except Exception as e:
        print(f"[Flashcard Gen Error] {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============= STUDY STREAK ENDPOINTS =============

@app.post("/api/study/session")
async def log_study_session(session: StudySession, user_id: str = Depends(get_current_user)):
    """Log a study session for today"""
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Try to update existing session for today
        cursor = await db.execute(
            "SELECT id, duration FROM study_sessions WHERE user_id = ? AND date = ?",
            (user_id, today)
        )
        existing = await cursor.fetchone()
        
        if existing:
            # Add to existing session duration
            new_duration = existing[1] + session.duration
            await db.execute(
                "UPDATE study_sessions SET duration = ? WHERE id = ?",
                (new_duration, existing[0])
            )
        else:
            # Create new session
            await db.execute(
                "INSERT INTO study_sessions (id, user_id, date, duration, created_at) VALUES (?, ?, ?, ?, ?)",
                (session_id, user_id, today, session.duration, now)
            )
        await db.commit()
    
    return {"message": "Study session logged successfully"}

@app.get("/api/study/streak")
async def get_study_streak(user_id: str = Depends(get_current_user)):
    """Get current study streak and statistics"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT date, duration FROM study_sessions WHERE user_id = ? ORDER BY date DESC",
            (user_id,)
        )
        sessions = await cursor.fetchall()
        
        if not sessions:
            return {"current_streak": 0, "longest_streak": 0, "total_sessions": 0, "total_minutes": 0}
        
        from datetime import date, timedelta
        dates = [datetime.fromisoformat(s['date'] + 'T00:00:00').date() if 'T' not in s['date'] else datetime.fromisoformat(s['date']).date() for s in sessions]
        total_minutes = sum(s['duration'] for s in sessions)
        
        # Calculate current streak
        today = date.today()
        current_streak = 0
        check_date = today
        
        while check_date in dates:
            current_streak += 1
            check_date -= timedelta(days=1)
        
        # If no session today, check if yesterday had one
        if today not in dates and current_streak == 0:
            yesterday = today - timedelta(days=1)
            if yesterday in dates:
                current_streak = 1
                check_date = yesterday - timedelta(days=1)
                while check_date in dates:
                    current_streak += 1
                    check_date -= timedelta(days=1)
        
        # Calculate longest streak
        longest_streak = 0
        temp_streak = 0
        prev_date = None
        
        for d in sorted(dates):
            if prev_date is None or d == prev_date + timedelta(days=1):
                temp_streak += 1
                longest_streak = max(longest_streak, temp_streak)
            else:
                temp_streak = 1
            prev_date = d
        
        return {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "total_sessions": len(sessions),
            "total_minutes": total_minutes
        }

@app.get("/api/study/analytics")
async def get_study_analytics(user_id: str = Depends(get_current_user)):
    """Get study analytics for charts"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Get last 30 days of study sessions
        cursor = await db.execute(
            """SELECT date, duration FROM study_sessions 
               WHERE user_id = ? 
               ORDER BY date DESC LIMIT 30""",
            (user_id,)
        )
        sessions = [dict(row) for row in await cursor.fetchall()]
        
        # Get task completion stats
        cursor = await db.execute(
            """SELECT status, COUNT(*) as count FROM tasks 
               WHERE user_id = ? 
               GROUP BY status""",
            (user_id,)
        )
        task_stats = {row['status']: row['count'] for row in await cursor.fetchall()}
        
        # Get notes by subject
        cursor = await db.execute(
            """SELECT subject, COUNT(*) as count FROM notes 
               WHERE user_id = ? 
               GROUP BY subject""",
            (user_id,)
        )
        notes_by_subject = {row['subject']: row['count'] for row in await cursor.fetchall()}
        
        # Get flashcard stats
        cursor = await db.execute(
            """SELECT COUNT(*) as total, 
               AVG(confidence_level) as avg_confidence,
               SUM(times_reviewed) as total_reviews
               FROM flashcards WHERE user_id = ?""",
            (user_id,)
        )
        flashcard_stats = dict(await cursor.fetchone())
        
        return {
            "study_sessions": sessions,
            "task_stats": task_stats,
            "notes_by_subject": notes_by_subject,
            "flashcard_stats": flashcard_stats
        }

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