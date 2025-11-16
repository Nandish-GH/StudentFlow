// Use local API during dev, relative path in production (Cloud Run/GAE)
const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8080/api'
    : '/api';
let token = localStorage.getItem('token');
let currentPage = 'dashboard';

// Rotating study tips
const STUDY_TIPS = [
    "💡 Take a 5-10 minute break every hour to stay focused!",
    "🎯 Use the Pomodoro Technique: 25 minutes of study, 5 minutes of rest",
    "📚 Teach what you learn - it's the best way to remember",
    "🌟 Study in the same place every day to build consistency",
    "🧠 Sleep is crucial for memory consolidation - get 7-9 hours!",
    "✍️ Handwriting notes improves retention compared to typing",
    "🎵 Try ambient music or white noise while studying",
    "🍎 Stay hydrated and eat brain-healthy snacks",
    "📝 Review your notes within 24 hours for better retention",
    "🎨 Use colors and diagrams to make concepts memorable",
    "⏰ Study difficult subjects when you're most alert",
    "🤝 Form study groups for collaborative learning",
    "📖 Read actively - summarize each paragraph in your own words",
    "🎯 Set specific, achievable goals for each study session",
    "🧘 Practice mindfulness to reduce study-related stress"
];

function rotateStudyTip() {
    const tip = STUDY_TIPS[Math.floor(Math.random() * STUDY_TIPS.length)];
    const tipElement = document.getElementById('study-tip');
    if (tipElement) {
        tipElement.textContent = tip;
        tipElement.style.animation = 'fadeIn 1s ease-in-out';
    }
}

// Flashcard state
let allFlashcards = [];
let studyFlashcards = [];
let currentStudyIndex = 0;
let isCardFlipped = false;

function showSignup() {
    document.querySelector('.auth-card:not(.hidden)').classList.add('hidden');
    document.getElementById('signup-card').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('signup-card').classList.add('hidden');
    document.querySelector('.auth-card:not(#signup-card)').classList.remove('hidden');
}

// Check if token is valid on page load
window.addEventListener('DOMContentLoaded', async () => {
    // Particles are initialized in simple-particles.js
    
    // Rotate study tip every 10 seconds
    rotateStudyTip();
    setInterval(rotateStudyTip, 10000);
    
    // If token exists, show app directly (no profile endpoint check needed)
    if (token) {
        showApp();
    }
});

// Removed legacy showLogin/showRegister toggles that referenced old IDs

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            token = data.access_token;
            localStorage.setItem('token', token);
            showApp();
        } else {
            const error = await response.json();
            alert(`Login failed: ${error.detail || 'Invalid credentials'}`);
        }
    } catch (err) {
        alert('Login failed: Network error');
    }
}

async function register() {
    const first_name = document.getElementById('reg-firstname').value;
    const last_name = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name, last_name, email, password })
        });

        if (response.ok) {
            alert('✅ Registration successful! Please login.');
            showLogin();
        } else {
            const error = await response.json();
            alert(`Registration failed: ${error.detail || 'Please try again'}`);
        }
    } catch (err) {
        alert('Registration failed: Network error');
    }
}

function logout() {
    localStorage.removeItem('token');
    token = null;
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('app-section').classList.add('hidden');
}

function showApp() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    showPage('dashboard');
    // Initialize squares animation if available
    if (window.initSquaresBackground) {
        setTimeout(() => window.initSquaresBackground(), 100);
    }
}

function updateNavBrand(page) {
    const pageNames = {
        'dashboard': '🏠 Dashboard',
        'notes': '📝 Notes',
        'study': '📚 Study',
        'flashcards': '🗂️ Flashcards',
        'community': '💬 Community',
        'wellbeing': '🧘 Wellbeing'
    };
    document.querySelector('.nav-brand').textContent = pageNames[page] || '📚 Home';
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`${page}-page`).classList.remove('hidden');
    currentPage = page;
    updateNavBrand(page);

    if (page === 'dashboard') loadDashboard();
    else if (page === 'notes') loadNotes();
    else if (page === 'study') loadTasks();
    else if (page === 'community') loadPosts();
    else if (page === 'wellbeing') loadMoods();
    else if (page === 'flashcards') loadFlashcardsPage();
}

async function loadDashboard() {
    // Set current date
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);

    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        const [notesResp, tasksResp, postsResp, streakResp] = await Promise.all([
            fetch(`${API_URL}/notes`, { headers }),
            fetch(`${API_URL}/study/tasks`, { headers }),
            fetch(`${API_URL}/community/posts`, { headers }),
            fetch(`${API_URL}/study/streak`, { headers })
        ]);

        if ([notesResp, tasksResp, postsResp, streakResp].some(r => r.status === 401)) {
            alert('Session expired. Please log in again.');
            logout();
            return;
        }

        const notesJson = notesResp.ok ? await notesResp.json() : [];
        const notes = Array.isArray(notesJson) ? notesJson : [];
        const tasksJson = tasksResp.ok ? await tasksResp.json() : [];
        const tasks = Array.isArray(tasksJson) ? tasksJson : [];
        const postsJson = postsResp.ok ? await postsResp.json() : [];
        const posts = Array.isArray(postsJson) ? postsJson : (Array.isArray(postsJson.posts) ? postsJson.posts : []);
        const streakData = streakResp.ok ? await streakResp.json() : { current_streak: 0 };

        // Update stats
        document.getElementById('stat-notes').textContent = notes.length || 0;
        document.getElementById('stat-tasks').textContent = (Array.isArray(tasks) ? tasks.filter(t => t.status === 'pending').length : 0) || 0;
        document.getElementById('stat-streak').textContent = (streakData.current_streak || 0);
        if (document.getElementById('stat-streak-text')) {
            document.getElementById('stat-streak-text').textContent = (streakData.current_streak === 1 ? 'day' : 'days');
        }
        document.getElementById('stat-posts').textContent = (Array.isArray(posts) ? posts.length : 0) || 0;

        // Load recent notes
        const recentNotesDiv = document.getElementById('recent-notes');
        const recentNotes = (Array.isArray(notes) ? notes : []).slice(0, 3);
        if (recentNotes.length === 0) {
            recentNotesDiv.innerHTML = '<p class="empty-state">No notes yet. Create your first note!</p>';
        } else {
            recentNotesDiv.innerHTML = recentNotes.map(note => `
                <div class="preview-card" onclick="showPage('notes')">
                    <h3>${note.title}</h3>
                    <p>${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>
                    ${note.subject ? `<span class="badge">${note.subject}</span>` : ''}
                </div>
            `).join('');
        }

        // Load upcoming tasks
        const upcomingTasksDiv = document.getElementById('upcoming-tasks');
        const pendingTasks = (Array.isArray(tasks) ? tasks : []).filter(t => t.status === 'pending').slice(0, 3);
        if (pendingTasks.length === 0) {
            upcomingTasksDiv.innerHTML = '<p class="empty-state">No pending tasks. You\'re all caught up!</p>';
        } else {
            upcomingTasksDiv.innerHTML = pendingTasks.map(task => `
                <div class="preview-card" onclick="showPage('study')">
                    <h3>${task.title}</h3>
                    <div class="task-meta">
                        <span class="badge badge-${task.priority}">${task.priority}</span>
                        ${task.due_date ? `<span class="due-date">📅 ${new Date(task.due_date).toLocaleDateString()}</span>` : ''}
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

async function loadNotes() {
    const response = await fetch(`${API_URL}/notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
    const json = response.ok ? await response.json() : [];
    const notes = Array.isArray(json) ? json : [];

    const list = document.getElementById('notes-list');
    list.innerHTML = notes.map(note => `
        <div class="item-card">
            <h3>${note.title}</h3>
            <p>${note.content}</p>
            <div class="item-meta">
                ${note.subject ? `<span class="badge badge-status">${note.subject}</span>` : ''}
                <button class="button" onclick="deleteNote('${note.id}')">
                    <svg viewBox="0 0 448 512" class="svgIcon"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function createNote() {
    const title = document.getElementById('note-title').value;
    const content = document.getElementById('note-content').value;
    const subject = document.getElementById('note-subject').value;

    if (!title.trim() || !content.trim()) {
        alert('Please fill in title and content');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/notes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, content, subject })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to create note');
        }

        closeModal('note-modal');
        loadNotes();
        loadDashboard();
    } catch (err) {
        alert('Failed to create note: ' + err.message);
    }
}

async function summarizeNote() {
    const content = document.getElementById('note-content').value;
    const summaryElement = document.getElementById('note-summary');
    
    if (!content.trim()) {
        summaryElement.textContent = 'Please add some content first';
        summaryElement.style.display = 'block';
        return;
    }
    
    summaryElement.textContent = '⏳ Generating summary...';
    summaryElement.style.display = 'block';
    
    try {
        const response = await fetch(`${API_URL}/ai/summarize-notes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        const data = await response.json();
        summaryElement.textContent = data.summary || '❌ Error generating summary';
    } catch (err) {
        summaryElement.textContent = '❌ Network error';
    }
}

async function deleteNote(id) {
    await fetch(`${API_URL}/notes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    loadNotes();
}

async function loadTasks() {
    const response = await fetch(`${API_URL}/study/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
    const json = response.ok ? await response.json() : [];
    const tasks = Array.isArray(json) ? json : [];

    const list = document.getElementById('tasks-list');
    list.innerHTML = tasks.map(task => `
        <div class="item-card">
            <h3>${task.title}</h3>
            <p>${task.description || ''}</p>
            <div class="item-meta">
                <span class="badge badge-priority-${task.priority}">${task.priority}</span>
                <span class="badge badge-status">${task.status}</span>
                ${task.subject ? `<span class="badge badge-status">${task.subject}</span>` : ''}
            </div>
            <div class="item-actions">
                <label class="task-check" title="Complete task">
                    <input type="checkbox" onchange="completeTaskWithAnimation('${task.id}', this)">
                    <svg viewBox="0 0 64 64" aria-hidden="true">
                        <path d="M 0 16 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 16 L 32 48 L 64 16 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 16" pathLength="575.0541381835938" class="path"></path>
                    </svg>
                </label>
            </div>
        </div>
    `).join('');
}

async function createTask() {
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const subject = document.getElementById('task-subject').value;
    const priority = document.getElementById('task-priority').value;
    const due_date = document.getElementById('task-due').value;
    const estimated_time = document.getElementById('task-time').value;

    if (!title.trim()) {
        alert('Please add a task title');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/study/tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, description, subject, priority, due_date, estimated_time })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to create task');
        }

        closeModal('task-modal');
        loadTasks();
        loadDashboard();
    } catch (err) {
        alert('Failed to create task: ' + err.message);
    }
}

async function updateTaskStatus(id, status) {
    await fetch(`${API_URL}/study/tasks/${id}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
    });
    loadTasks();
}

async function deleteTask(id) {
    await fetch(`${API_URL}/study/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    loadTasks();
}

// When a task checkbox is checked, wait a few seconds then delete.
// If unchecked before the delay ends, cancel deletion.
function completeTaskWithAnimation(id, checkboxEl) {
    if (!checkboxEl) return;

    const card = checkboxEl.closest('.item-card');

    // If checked: add pending style and schedule deletion
    if (checkboxEl.checked) {
        if (card) card.classList.add('task-pending-delete');
        // Log study session when task is completed (5 min per task)
        logStudySession(5);
        // 3000ms = a few seconds for the user to see the effect
        const timeoutId = setTimeout(() => {
            deleteTask(id);
        }, 3000);
        checkboxEl.dataset.deleteTimeout = String(timeoutId);
    } else {
        // If unchecked: cancel scheduled deletion and remove style
        const t = checkboxEl.dataset.deleteTimeout;
        if (t) {
            clearTimeout(parseInt(t, 10));
            delete checkboxEl.dataset.deleteTimeout;
        }
        if (card) card.classList.remove('task-pending-delete');
    }
}

// Log study session
async function logStudySession(duration) {
    try {
        await fetch(`${API_URL}/study/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ duration })
        });
    } catch (err) {
        console.error('Failed to log study session:', err);
    }
}

async function generateStudyPlan() {
    const subject = document.getElementById('plan-subject').value;
    const topicsInput = document.getElementById('plan-topics').value;
    const timeline = document.getElementById('plan-timeline').value;
    const difficulty = document.getElementById('plan-difficulty').value;
    const resultElement = document.getElementById('plan-result');
    const contentElement = document.getElementById('plan-content');

    if (!subject.trim() || !topicsInput.trim()) {
        contentElement.textContent = 'Please fill in subject and topics';
        resultElement.style.display = 'block';
        return;
    }

    const topics = topicsInput.split(',').map(t => t.trim()).filter(t => t);
    
    contentElement.innerHTML = '<div style="text-align: center; padding: 40px;">⏳ Generating your personalized study plan...</div>';
    resultElement.style.display = 'block';

    try {
        const response = await fetch(`${API_URL}/ai/study-plan`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subject, topics, timeline, difficulty })
        });

        if (!response.ok) {
            throw new Error('Failed to generate plan');
        }

        const data = await response.json();
        const studyPlan = data.study_plan || '';
        
        // Store the raw plan for saving/downloading
        window.currentStudyPlan = { subject, plan: studyPlan };
        
        // Parse markdown and format the content
        contentElement.innerHTML = parseMarkdownToHTML(studyPlan);
    } catch (err) {
        contentElement.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">❌ Failed to generate study plan. Please try again.</div>';
    }
}

function parseMarkdownToHTML(markdown) {
    if (!markdown) return '<p>No content generated.</p>';
    
    let html = markdown;
    
    // Convert headers (### to h3, ## to h2, # to h1)
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');
    
    // Convert bold **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Convert bullet points
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>');
    
    // Convert paragraphs (double newline)
    html = html.split('\n\n').map(para => {
        para = para.trim();
        if (!para) return '';
        if (para.startsWith('<h') || para.startsWith('<ul')) return para;
        return `<p>${para}</p>`;
    }).join('\n');
    
    // Clean up any remaining single newlines
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

async function saveStudyPlan() {
    if (!window.currentStudyPlan) {
        alert('No study plan to save');
        return;
    }
    
    const { subject, plan } = window.currentStudyPlan;
    const title = `Study Plan: ${subject}`;
    
    try {
        const response = await fetch(`${API_URL}/notes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                title, 
                content: plan, 
                subject: subject 
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save');
        }
        
        alert('✅ Study plan saved to notes!');
        loadNotes();
    } catch (err) {
        alert('❌ Failed to save study plan');
    }
}

function downloadStudyPlan() {
    if (!window.currentStudyPlan) {
        alert('No study plan to download');
        return;
    }
    
    const { subject, plan } = window.currentStudyPlan;
    const filename = `study-plan-${subject.toLowerCase().replace(/\s+/g, '-')}.txt`;
    
    const blob = new Blob([plan], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function loadPosts() {
    const response = await fetch(`${API_URL}/community/posts`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
    const data = response.ok ? await response.json() : [];
    const posts = Array.isArray(data) ? data : (Array.isArray(data.posts) ? data.posts : []);

    const list = document.getElementById('posts-list');
    list.innerHTML = posts.map(post => `
        <div class="item-card" data-post-id="${post.id}">
            <h3>${post.title}</h3>
            <p style="margin-top:-6px; opacity:0.8; font-size: 0.9rem;">by ${post.author_first_name ? (post.author_first_name + (post.author_last_name ? ' ' + post.author_last_name : '')) : (post.author_email || 'unknown')}</p>
            <p>${post.content}</p>
            <div class="item-meta">
                <div class="heart-container" title="Like">
                    <input type="checkbox" class="checkbox" id="like-${post.id}" ${post.liked ? 'checked' : ''} onchange="toggleLike('${post.id}', this)">
                    <div class="svg-container">
                        <svg viewBox="0 0 24 24" class="svg-outline" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z"></path>
                        </svg>
                        <svg viewBox="0 0 24 24" class="svg-filled" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z"></path>
                        </svg>
                        <svg class="svg-celebrate" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                            <polygon points="10,10 20,20"></polygon>
                            <polygon points="10,50 20,50"></polygon>
                            <polygon points="20,80 30,70"></polygon>
                            <polygon points="90,10 80,20"></polygon>
                            <polygon points="90,50 80,50"></polygon>
                            <polygon points="80,80 70,70"></polygon>
                        </svg>
                    </div>
                </div>
                <span class="badge badge-status" id="likes-${post.id}">${post.likes || 0} likes</span>
                <button class="bookmarkBtn" onclick="toggleComments('${post.id}')">
                    <span class="IconContainer"> 
                        <svg fill="white" viewBox="0 0 512 512" height="1em"><path d="M123.6 391.3c12.9-9.4 29.6-11.8 44.6-6.4c26.5 9.6 56.2 15.1 87.8 15.1c124.7 0 208-80.5 208-160s-83.3-160-208-160S48 160.5 48 240c0 32 12.4 62.8 35.7 89.2c8.6 9.7 12.8 22.5 11.8 35.5c-1.4 18.1-5.7 34.7-11.3 49.4c17-7.9 31.1-16.7 39.4-22.7zM21.2 431.9c1.8-2.7 3.5-5.4 5.1-8.1c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208s-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6c-15.1 6.6-32.3 12.6-50.1 16.1c-.8 .2-1.6 .3-2.4 .5c-4.4 .8-8.7 1.5-13.2 1.9c-.2 0-.5 .1-.7 .1c-5.1 .5-10.2 .8-15.3 .8c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c4.1-4.2 7.8-8.7 11.3-13.5c1.7-2.3 3.3-4.6 4.8-6.9c.1-.2 .2-.3 .3-.5z"></path></svg>
                    </span>
                    <p class="text">Comment</p>
                </button>
                ${post.can_delete ? `
                <button class="button" onclick="deletePost('${post.id}')">
                    <svg viewBox="0 0 448 512" class="svgIcon"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>
                </button>` : ''}
            </div>
            <div id="comments-${post.id}" class="comments-section" style="display:none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);"></div>
        </div>
    `).join('');
}

async function createPost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;

    if (!title.trim() || !content.trim()) {
        alert('Please fill in title and content');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/community/posts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, content })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to create post');
        }

        closeModal('post-modal');
        loadPosts();
    } catch (err) {
        alert('Failed to create post: ' + err.message);
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/community/posts/${postId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to delete post');
        }

        loadPosts();
    } catch (err) {
        alert('Failed to delete post: ' + err.message);
    }
}

// Toggle like with backend persistence and optimistic UI
async function toggleLike(postId, checkboxEl) {
    const span = document.getElementById(`likes-${postId}`);
    const checked = !!(checkboxEl && checkboxEl.checked);
    // Optimistic update
    if (span) {
        const raw = span.dataset.count || span.textContent || '0';
        const match = String(raw).match(/\d+/);
        const current = match ? parseInt(match[0], 10) : 0;
        const next = Math.max(0, current + (checked ? 1 : -1));
        span.dataset.count = String(next);
        span.textContent = `${next} likes`;
    }

    try {
        const endpoint = `${API_URL}/community/posts/${postId}/like`;
        const res = await fetch(endpoint, {
            method: checked ? 'POST' : 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
        if (!res.ok) throw new Error('Failed to update like');
    } catch (e) {
        // Revert UI on failure
        if (checkboxEl) checkboxEl.checked = !checked;
        if (span) {
            const raw = span.dataset.count || span.textContent || '0';
            const match = String(raw).match(/\d+/);
            const current = match ? parseInt(match[0], 10) : 0;
            const revert = Math.max(0, current + (checked ? -1 : 1));
            span.dataset.count = String(revert);
            span.textContent = `${revert} likes`;
        }
        console.error(e);
    }
}

async function toggleComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);
    
    if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsDiv.style.display = 'none';
    }
}

async function loadComments(postId) {
    try {
        const response = await fetch(`${API_URL}/community/posts/${postId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
        
        const data = await response.json();
        const comments = data.comments || [];
        
        const commentsDiv = document.getElementById(`comments-${postId}`);
        commentsDiv.innerHTML = `
            <div class="messageBox" style="margin-bottom: 12px; display:flex; gap:8px; align-items:center;">
                <input required placeholder="Message..." type="text" id="messageInput-${postId}" style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); color: white;" />
                <button id="sendButton-${postId}" onclick="addComment('${postId}')" style="background:transparent; border:0; cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 664 663" width="28" height="28">
                      <path fill="none" d="M646.293 331.888L17.7538 17.6187L155.245 331.888M646.293 331.888L17.753 646.157L155.245 331.888M646.293 331.888L318.735 330.228L155.245 331.888"></path>
                      <path stroke-linejoin="round" stroke-linecap="round" stroke-width="33.67" stroke="#bfc7d1" d="M646.293 331.888L17.7538 17.6187L155.245 331.888M646.293 331.888L17.753 646.157L155.245 331.888M646.293 331.888L318.735 330.228L155.245 331.888"></path>
                    </svg>
                </button>
            </div>
            <div id="comments-list-${postId}">
                ${comments.map(comment => `
                    <div class="comment-item" style="padding: 10px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 5px; border-left: 3px solid var(--accent-color);">
                        <p style="margin: 0; font-size: 0.85rem; opacity: 0.7; margin-bottom: 5px;">
                            ${comment.author_first_name || 'Unknown'} ${comment.author_last_name || ''} • ${new Date(comment.created_at).toLocaleString()}
                        </p>
                        <p style="margin: 0;">${comment.content}</p>
                        ${comment.can_delete ? `<button class="comment-delete" onclick="deleteComment('${postId}', '${comment.id}')" title="Delete comment">\n                            <svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2\" stroke=\"rgba(255,255,255,0.9)\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/></svg>\n                        </button>` : ''}
                    </div>
                `).join('') || '<p style="opacity: 0.5; font-style: italic;">No comments yet</p>'}
            </div>
        `;
        
        // Add Enter key listener to the new message input
        const input = document.getElementById(`messageInput-${postId}`);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addComment(postId);
                }
            });
        }
    } catch (err) {
        console.error('Failed to load comments:', err);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`messageInput-${postId}`);
    const content = input ? input.value.trim() : '';
    
    if (!content) {
        alert('Please enter a comment');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/community/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to add comment');
        }
        
        if (input) input.value = '';
        await loadComments(postId);
    } catch (err) {
        alert('Failed to add comment: ' + err.message);
    }
}

async function deleteComment(postId, commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/community/posts/${postId}/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to delete comment');
        }
        
        await loadComments(postId);
    } catch (err) {
        alert('Failed to delete comment: ' + err.message);
    }
}

async function loadMoods() {
    const response = await fetch(`${API_URL}/wellbeing/mood-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) { alert('Session expired. Please log in again.'); logout(); return; }
    const json = response.ok ? await response.json() : [];
    const moods = Array.isArray(json) ? json : [];

    const list = document.getElementById('mood-list');
    list.innerHTML = moods.map(mood => `
        <div class="item-card">
            <h3>Mood: ${mood.mood_score}/5</h3>
            <p>Energy: ${mood.energy_level || 'N/A'} | Stress: ${mood.stress_level || 'N/A'}</p>
            ${mood.notes ? `<p>${mood.notes}</p>` : ''}
            <div class="item-meta">
                <span class="badge badge-status">${new Date(mood.date).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

async function logMood() {
    const mood_score = parseInt(document.getElementById('mood-score').value);
    const energy_level = parseInt(document.getElementById('mood-energy').value);
    const stress_level = parseInt(document.getElementById('mood-stress').value);
    const notes = document.getElementById('mood-notes').value;

    try {
        const response = await fetch(`${API_URL}/wellbeing/mood-logs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mood_score, energy_level, stress_level, notes })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to log mood');
        }

        closeModal('mood-modal');
        loadMoods();
        loadDashboard();
    } catch (err) {
        alert('Failed to log mood: ' + err.message);
    }
}

function showModal(id) {
    document.getElementById(id).style.display = 'block';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

document.getElementById('mood-score').addEventListener('input', (e) => {
    document.getElementById('mood-value').textContent = e.target.value;
});

document.getElementById('mood-energy').addEventListener('input', (e) => {
    document.getElementById('energy-value').textContent = e.target.value;
});

document.getElementById('mood-stress').addEventListener('input', (e) => {
    document.getElementById('stress-value').textContent = e.target.value;
});

// AI Chat Functions
let chatHistory = [];

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    input.value = '';
    
    // Add to history
    chatHistory.push({ role: 'user', content: message });
    
    // Show loading indicator
    const loadingId = addChatMessage('Thinking...', 'ai', true);
    
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                context: chatHistory.slice(-5) // Last 5 messages for context
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Remove loading message
            document.getElementById(loadingId).remove();
            
            // Add AI response
            addChatMessage(data.response, 'ai');
            chatHistory.push({ role: 'assistant', content: data.response });
        } else {
            document.getElementById(loadingId).remove();
            addChatMessage('Sorry, I encountered an error. Please try again.', 'ai');
        }
    } catch (err) {
        console.error('Chat error:', err);
        document.getElementById(loadingId).remove();
        addChatMessage('Network error. Please check your connection.', 'ai');
    }
}

function addChatMessage(text, sender, isLoading = false) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageId = `msg-${Date.now()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `chat-message ${sender}`;

    // Build bubble markup
    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (sender === 'ai') {
        // AI bubble: include a small label and styled bubble
        bubble.innerHTML = `<div class="meta"><strong>Assistant</strong></div><div class="content">${text}</div>`;
        messageDiv.appendChild(bubble);
    } else if (sender === 'user') {
        bubble.innerHTML = `<div class="content">${text}</div>`;
        messageDiv.appendChild(bubble);
    } else {
        // generic / loading
        bubble.textContent = text;
        messageDiv.appendChild(bubble);
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageId;
}

// Allow Enter to send message (Shift+Enter for new line)
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
});

// ============= FLASHCARDS FUNCTIONS =============

async function loadFlashcardsPage() {
    await loadFlashcards();
    await loadFlashcardStats();
    await populateGenerateNoteSelect();
}

async function loadFlashcards(subject = null) {
    try {
        const url = subject ? `${API_URL}/flashcards?subject=${encodeURIComponent(subject)}` : `${API_URL}/flashcards`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load flashcards');
        
        allFlashcards = await response.json();
        displayFlashcards();
        populateFlashcardSubjectFilter();
    } catch (error) {
        console.error('Error loading flashcards:', error);
    }
}

function displayFlashcards() {
    const grid = document.getElementById('flashcards-grid');
    const empty = document.getElementById('flashcards-empty');
    const studyAllBtn = document.getElementById('study-all-btn');
    
    if (allFlashcards.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        if (studyAllBtn) studyAllBtn.style.display = 'none';
        return;
    }
    
    grid.style.display = 'grid';
    empty.style.display = 'none';
    if (studyAllBtn) studyAllBtn.style.display = 'inline-block';
    
    grid.innerHTML = allFlashcards.map(card => {
        const difficultyColors = {
            'easy': 'background: #d1fae5; color: #065f46;',
            'medium': 'background: #fef3c7; color: #92400e;',
            'hard': 'background: #fee2e2; color: #991b1b;'
        };
        const difficultyStyle = difficultyColors[card.difficulty] || difficultyColors['medium'];
        
        return `
        <div class="item-card" style="position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                ${card.subject ? `<span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 600;">📚 ${card.subject}</span>` : '<span></span>'}
                <span class="badge" style="${difficultyStyle} font-weight: 600; text-transform: uppercase; font-size: 0.75rem;">${card.difficulty}</span>
            </div>
            <div style="margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 0.5rem;">Question</div>
                <h3 style="font-size: 1rem; line-height: 1.5;">${card.question.length > 120 ? card.question.substring(0, 120) + '...' : card.question}</h3>
            </div>
            <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px; border-left: 3px solid #4f46e5; margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">Answer Preview</div>
                <p style="color: #6b7280; font-size: 0.875rem;">${card.answer.length > 100 ? card.answer.substring(0, 100) + '...' : card.answer}</p>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid #e5e7eb;">
                <div style="color: #6b7280; font-size: 0.75rem; display: flex; gap: 1rem;">
                    <span>📚 ${card.times_reviewed || 0}x</span>
                    <span>⭐ ${card.confidence_level || 0}/5</span>
                </div>
                <div class="button-group" style="gap: 0.5rem;">
                    <button class="btn-primary" onclick="startStudyMode('${card.id}')" style="padding: 0.5rem 1rem; font-size: 0.875rem; background: #10b981;">Study</button>
                    <button class="btn-primary" onclick="deleteFlashcard('${card.id}')" style="padding: 0.5rem 1rem; font-size: 0.875rem; background: #ef4444;">Delete</button>
                </div>
            </div>
        </div>
    `}).join('');
}

async function loadFlashcardStats() {
    try {
        const response = await fetch(`${API_URL}/study/analytics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        document.getElementById('total-flashcards').textContent = data.flashcard_stats.total || 0;
        document.getElementById('total-reviews').textContent = data.flashcard_stats.total_reviews || 0;
        const avgConf = data.flashcard_stats.avg_confidence || 0;
        document.getElementById('avg-flashcard-confidence').textContent = avgConf.toFixed(1) + '/5';
    } catch (error) {
        console.error('Error loading flashcard stats:', error);
    }
}

function populateFlashcardSubjectFilter() {
    const subjects = [...new Set(allFlashcards.map(c => c.subject).filter(s => s))];
    const select = document.getElementById('flashcard-subject-filter');
    select.innerHTML = '<option value="">All Subjects</option>' +
        subjects.map(s => `<option value="${s}">${s}</option>`).join('');
}

function filterFlashcardsBySubject() {
    const subject = document.getElementById('flashcard-subject-filter').value;
    loadFlashcards(subject || null);
}

async function createFlashcard() {
    const question = document.getElementById('flashcard-question').value;
    const answer = document.getElementById('flashcard-answer').value;
    const subject = document.getElementById('flashcard-subject').value || null;
    const difficulty = document.getElementById('flashcard-difficulty').value;
    
    if (!question || !answer) {
        alert('Please enter both question and answer');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/flashcards`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ question, answer, subject, difficulty })
        });
        
        if (!response.ok) throw new Error('Failed to create flashcard');
        
        alert('✅ Flashcard created successfully!');
        closeModal('flashcard-modal');
        document.getElementById('flashcard-question').value = '';
        document.getElementById('flashcard-answer').value = '';
        document.getElementById('flashcard-subject').value = '';
        await loadFlashcards();
        await loadFlashcardStats();
    } catch (error) {
        console.error('Error creating flashcard:', error);
        alert('❌ Failed to create flashcard');
    }
}

async function populateGenerateNoteSelect() {
    try {
        const response = await fetch(`${API_URL}/notes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const notes = await response.json();
        const select = document.getElementById('generate-note-select');
        select.innerHTML = '<option value="">Choose a note...</option>' +
            notes.map(note => `<option value="${note.id}">${note.title}</option>`).join('');
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

async function generateFlashcardsFromNote() {
    const noteId = document.getElementById('generate-note-select').value;
    const count = parseInt(document.getElementById('generate-card-count').value) || 5;
    
    if (!noteId) {
        alert('Please select a note');
        return;
    }
    
    const btnText = document.getElementById('generate-flashcard-btn-text');
    btnText.textContent = '⏳ Generating...';
    
    try {
        const response = await fetch(`${API_URL}/flashcards/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ note_id: noteId, count })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to generate flashcards');
        }
        
        const result = await response.json();
        alert('✅ ' + result.message);
        closeModal('generate-flashcard-modal');
        await loadFlashcards();
        await loadFlashcardStats();
    } catch (error) {
        console.error('Error generating flashcards:', error);
        alert('❌ ' + error.message);
    } finally {
        btnText.textContent = '✨ Generate';
    }
}

async function deleteFlashcard(cardId) {
    if (!confirm('Delete this flashcard?')) return;
    
    try {
        const response = await fetch(`${API_URL}/flashcards/${cardId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete flashcard');
        
        alert('✅ Flashcard deleted');
        await loadFlashcards();
        await loadFlashcardStats();
    } catch (error) {
        console.error('Error deleting flashcard:', error);
        alert('❌ Failed to delete flashcard');
    }
}

function startStudyMode(cardId = null) {
    if (cardId) {
        const card = allFlashcards.find(c => c.id === cardId);
        if (!card) return;
        studyFlashcards = [card];
    } else {
        if (allFlashcards.length === 0) {
            alert('No flashcards to study');
            return;
        }
        studyFlashcards = [...allFlashcards];
    }
    
    currentStudyIndex = 0;
    isCardFlipped = false;
    document.getElementById('flashcards-grid').style.display = 'none';
    document.getElementById('flashcards-empty').style.display = 'none';
    document.getElementById('flashcard-stats').style.display = 'none';
    document.getElementById('study-mode').style.display = 'block';
    displayStudyCard();
}

function exitStudyMode() {
    document.getElementById('study-mode').style.display = 'none';
    document.getElementById('flashcard-stats').style.display = 'grid';
    displayFlashcards();
}

function displayStudyCard() {
    if (studyFlashcards.length === 0) return;
    
    const card = studyFlashcards[currentStudyIndex];
    document.getElementById('study-question').textContent = card.question;
    document.getElementById('study-answer').textContent = card.answer;
    document.getElementById('study-card-progress').textContent = `${currentStudyIndex + 1} / ${studyFlashcards.length}`;
    
    const flashcard = document.getElementById('study-flashcard');
    flashcard.style.transform = 'rotateY(0deg)';
    isCardFlipped = false;
}

function flipStudyCard() {
    const flashcard = document.getElementById('study-flashcard');
    isCardFlipped = !isCardFlipped;
    flashcard.style.transform = isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
}

function nextStudyCard() {
    if (currentStudyIndex < studyFlashcards.length - 1) {
        currentStudyIndex++;
        displayStudyCard();
    } else {
        alert('🎉 You\'ve reviewed all cards!');
    }
}

function previousStudyCard() {
    if (currentStudyIndex > 0) {
        currentStudyIndex--;
        displayStudyCard();
    }
}

async function rateStudyCard(confidence) {
    const card = studyFlashcards[currentStudyIndex];
    
    try {
        const response = await fetch(`${API_URL}/flashcards/${card.id}/review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ confidence })
        });
        
        if (!response.ok) throw new Error('Failed to record review');
        
        if (currentStudyIndex < studyFlashcards.length - 1) {
            nextStudyCard();
        } else {
            alert('🎉 Study session complete!');
            exitStudyMode();
            await loadFlashcards();
            await loadFlashcardStats();
        }
    } catch (error) {
        console.error('Error recording review:', error);
    }
}

// ============= GOOGLE CALENDAR INTEGRATION =============

async function connectGoogleCalendar() {
    try {
        // Get upcoming tasks to add to calendar
        const response = await fetch(`${API_URL}/study/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch tasks');
        }
        
        const tasks = await response.json();
        const incompleteTasks = tasks.filter(t => !t.completed);
        
        if (incompleteTasks.length === 0) {
            alert('📅 No pending tasks to add to calendar!\n\nCreate some tasks first, then sync them to Google Calendar.');
            return;
        }
        
        // Create calendar events text for manual addition
        let calendarText = '📅 Add these tasks to Google Calendar:\n\n';
        incompleteTasks.forEach(task => {
            const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date';
            calendarText += `• ${task.title}\n  Due: ${dueDate}\n  Subject: ${task.subject || 'General'}\n\n`;
        });
        
        calendarText += '\nOpening Google Calendar...';
        alert(calendarText);
        
        // Open Google Calendar
        window.open('https://calendar.google.com/calendar/r', '_blank');
        
    } catch (error) {
        console.error('Error syncing with calendar:', error);
        alert('❌ Failed to sync with Google Calendar. Please try again later.');
    }
}

if (token) {
    showApp();
}