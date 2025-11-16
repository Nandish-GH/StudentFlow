# Firebase Setup Guide for StudentFlow

## Your Firebase Project Details
- **Project ID**: `studentflow-dc8c3`
- **Project Number**: `494129898410`

## Steps to Complete Firebase Setup

### 1. Enable Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **studentflow-dc8c3**
3. Click on **"Build"** in the left sidebar
4. Click on **"Authentication"**
5. Click **"Get Started"**
6. Click on **"Sign-in method"** tab
7. Click on **"Email/Password"**
8. Toggle **"Enable"** to ON
9. Click **"Save"**

### 2. Enable Firestore Database

1. In Firebase Console, click **"Firestore Database"** (under Build)
2. Click **"Create Database"**
3. Select **"Start in production mode"** (we'll set rules next)
4. Choose a location (select closest to `us-east1` like `us-east4`)
5. Click **"Enable"**

### 3. Set Firestore Security Rules

1. In Firestore Database, click on **"Rules"** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read/write their own notes
    match /notes/{noteId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
    
    // Users can read/write their own tasks
    match /tasks/{taskId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
    
    // Users can read/write their own flashcards
    match /flashcards/{cardId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
    
    // Everyone can read posts, but only authors can edit/delete
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.authorId == request.auth.uid;
    }
    
    // Users can read/write their own mood logs
    match /mood_logs/{logId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

### 4. Get Your Web App Configuration (Optional - if needed later)

1. In Firebase Console, click the **gear icon** ⚙️ next to "Project Overview"
2. Click **"Project settings"**
3. Scroll down to **"Your apps"**
4. Click the **web icon** `</>`
5. Register your app with a nickname (e.g., "StudentFlow Web")
6. Copy the `firebaseConfig` object
7. You can update the `appId` in `.env` file if you want

## What's Already Done ✅

- Firebase SDK scripts are loaded in your HTML
- Authentication is configured to use your project
- Login/Register functions use Firebase Authentication
- Firebase project ID is correctly set to `studentflow-dc8c3`
- Calendar button now shows embedded Google Calendar (no 403 errors!)

## Testing Your Setup

1. Visit: https://studentflow-873155023482.us-east1.run.app
2. Click **"Sign Up"** and create a new account
3. Try logging in with your credentials
4. Your account will now persist across sessions!
5. Click the **📅 Calendar** button in navbar to see embedded Google Calendar

## Troubleshooting

If you see errors:
- Make sure Email/Password authentication is enabled in Firebase Console
- Check that Firestore is created and rules are published
- Open browser console (F12) to see detailed Firebase error messages
