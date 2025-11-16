// Simple auth helper for flashcards page
function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

// Check if user is logged in
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/';
}
