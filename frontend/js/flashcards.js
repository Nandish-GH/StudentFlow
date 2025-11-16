// Flashcards functionality
let allFlashcards = [];
let studyCards = [];
let currentCardIndex = 0;
let isFlipped = false;

// Load flashcards on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadFlashcards();
    await loadNotes();
    await loadStats();
});

// Load all flashcards
async function loadFlashcards(subject = null) {
    try {
        const token = localStorage.getItem('token');
        const url = subject ? `/api/flashcards?subject=${encodeURIComponent(subject)}` : '/api/flashcards';
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load flashcards');
        
        allFlashcards = await response.json();
        displayFlashcards();
        populateSubjectFilter();
    } catch (error) {
        console.error('Error loading flashcards:', error);
        showNotification('Failed to load flashcards', 'error');
    }
}

// Display flashcards in grid
function displayFlashcards() {
    const grid = document.getElementById('cards-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (allFlashcards.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    grid.innerHTML = allFlashcards.map(card => `
        <div class="flashcard-item" onclick="startStudyMode('${card.id}')">
            <div class="flashcard-header">
                ${card.subject ? `<span class="flashcard-subject">${escapeHtml(card.subject)}</span>` : '<span></span>'}
                <span class="flashcard-difficulty ${card.difficulty}">${card.difficulty}</span>
            </div>
            <div class="flashcard-question">${escapeHtml(card.question).substring(0, 100)}${card.question.length > 100 ? '...' : ''}</div>
            <div class="flashcard-stats">
                <div class="flashcard-stat">
                    <span>📚</span>
                    <span>Reviewed ${card.times_reviewed || 0}x</span>
                </div>
                <div class="flashcard-stat">
                    <span>⭐</span>
                    <span>Level ${card.confidence_level || 0}/5</span>
                </div>
            </div>
            <div class="flashcard-actions" onclick="event.stopPropagation()">
                <button class="btn-study" onclick="startStudyMode('${card.id}')">Study</button>
                <button class="btn-delete" onclick="deleteFlashcard('${card.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// Load notes for generation dropdown
async function loadNotes() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/notes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load notes');
        
        const notes = await response.json();
        const select = document.getElementById('note-select');
        select.innerHTML = '<option value="">Choose a note...</option>' +
            notes.map(note => `<option value="${note.id}">${escapeHtml(note.title)}</option>`).join('');
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

// Load statistics
async function loadStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/study/analytics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        document.getElementById('total-cards').textContent = data.flashcard_stats.total || 0;
        document.getElementById('total-reviews').textContent = data.flashcard_stats.total_reviews || 0;
        const avgConf = data.flashcard_stats.avg_confidence || 0;
        document.getElementById('avg-confidence').textContent = avgConf.toFixed(1) + '/5';
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Populate subject filter dropdown
function populateSubjectFilter() {
    const subjects = [...new Set(allFlashcards.map(c => c.subject).filter(s => s))];
    const select = document.getElementById('subject-filter');
    select.innerHTML = '<option value="">All Subjects</option>' +
        subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

// Filter by subject
function filterBySubject() {
    const subject = document.getElementById('subject-filter').value;
    loadFlashcards(subject || null);
}

// Show create modal
function showCreateModal() {
    document.getElementById('create-modal').style.display = 'flex';
    document.getElementById('new-question').value = '';
    document.getElementById('new-answer').value = '';
    document.getElementById('new-subject').value = '';
    document.getElementById('new-difficulty').value = 'medium';
}

// Show generate modal
function showGenerateModal() {
    document.getElementById('generate-modal').style.display = 'flex';
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Create flashcard
async function createFlashcard(event) {
    event.preventDefault();
    
    const flashcard = {
        question: document.getElementById('new-question').value,
        answer: document.getElementById('new-answer').value,
        subject: document.getElementById('new-subject').value || null,
        difficulty: document.getElementById('new-difficulty').value
    };
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/flashcards', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(flashcard)
        });
        
        if (!response.ok) throw new Error('Failed to create flashcard');
        
        showNotification('Flashcard created successfully!', 'success');
        closeModal('create-modal');
        await loadFlashcards();
        await loadStats();
    } catch (error) {
        console.error('Error creating flashcard:', error);
        showNotification('Failed to create flashcard', 'error');
    }
}

// Generate flashcards from note
async function generateFlashcards(event) {
    event.preventDefault();
    
    const noteId = document.getElementById('note-select').value;
    const count = parseInt(document.getElementById('card-count').value) || 5;
    
    if (!noteId) {
        showNotification('Please select a note', 'error');
        return;
    }
    
    const btnText = document.getElementById('generate-btn-text');
    btnText.textContent = '⏳ Generating...';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/flashcards/generate', {
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
        showNotification(result.message, 'success');
        closeModal('generate-modal');
        await loadFlashcards();
        await loadStats();
    } catch (error) {
        console.error('Error generating flashcards:', error);
        showNotification(error.message || 'Failed to generate flashcards', 'error');
    } finally {
        btnText.textContent = '✨ Generate';
    }
}

// Delete flashcard
async function deleteFlashcard(cardId) {
    if (!confirm('Delete this flashcard?')) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/flashcards/${cardId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete flashcard');
        
        showNotification('Flashcard deleted', 'success');
        await loadFlashcards();
        await loadStats();
    } catch (error) {
        console.error('Error deleting flashcard:', error);
        showNotification('Failed to delete flashcard', 'error');
    }
}

// Start study mode
function startStudyMode(cardId = null) {
    if (cardId) {
        // Study single card
        const card = allFlashcards.find(c => c.id === cardId);
        if (!card) return;
        studyCards = [card];
    } else {
        // Study all cards
        if (allFlashcards.length === 0) {
            showNotification('No flashcards to study', 'error');
            return;
        }
        studyCards = [...allFlashcards];
    }
    
    currentCardIndex = 0;
    document.getElementById('cards-grid').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('stats-section').style.display = 'none';
    document.getElementById('study-mode').style.display = 'block';
    
    showCard();
}

// Exit study mode
function exitStudyMode() {
    document.getElementById('study-mode').style.display = 'none';
    document.getElementById('stats-section').style.display = 'grid';
    displayFlashcards();
}

// Show current card
function showCard() {
    if (studyCards.length === 0) return;
    
    const card = studyCards[currentCardIndex];
    document.getElementById('card-question').textContent = card.question;
    document.getElementById('card-answer').textContent = card.answer;
    document.getElementById('study-progress-text').textContent = `${currentCardIndex + 1} / ${studyCards.length}`;
    
    // Reset flip state
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped');
    isFlipped = false;
}

// Flip card
function flipCard() {
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.toggle('flipped');
    isFlipped = !isFlipped;
}

// Next card
function nextCard() {
    if (currentCardIndex < studyCards.length - 1) {
        currentCardIndex++;
        showCard();
    } else {
        showNotification('🎉 You\'ve reviewed all cards!', 'success');
    }
}

// Previous card
function previousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        showCard();
    }
}

// Rate card confidence
async function rateCard(confidence) {
    const card = studyCards[currentCardIndex];
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/flashcards/${card.id}/review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ confidence })
        });
        
        if (!response.ok) throw new Error('Failed to record review');
        
        // Move to next card automatically
        if (currentCardIndex < studyCards.length - 1) {
            nextCard();
        } else {
            showNotification('🎉 Study session complete!', 'success');
            exitStudyMode();
            await loadFlashcards();
            await loadStats();
        }
    } catch (error) {
        console.error('Error recording review:', error);
        showNotification('Failed to record review', 'error');
    }
}

// Utility: escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Close modals on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}
