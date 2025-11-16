# Firebase Service Account Setup

## Generate Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: **studentflow-dc8c3**
3. Click the **gear icon** ⚙️ next to "Project Overview"
4. Click **"Project settings"**
5. Go to **"Service accounts"** tab
6. Click **"Generate new private key"** button
7. Click **"Generate key"**
8. A JSON file will download - **IMPORTANT: Keep this secure!**

## Add Service Account Key to Project

### Option 1: Direct File Method (Development)
1. Rename the downloaded file to `firebase-service-account.json`
2. Place it in your project root: `c:\Users\mihir\OneDrive\Desktop\hack\studentflow\`
3. Add to `.gitignore` to prevent committing:
   ```
   firebase-service-account.json
   ```

### Option 2: Environment Variable Method (Production - Recommended)
1. Open the downloaded JSON file
2. Copy the entire JSON content
3. In Cloud Run deployment, add it as an environment variable:
   ```bash
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"studentflow-dc8c3",...}'
   ```

## Service Account Details

**Service Account Email**: 
`firebase-adminsdk-fbsvc@studentflow-dc8c3.iam.gserviceaccount.com`

**Database URL**: 
`https://studentflow-dc8c3-default-rtdb.firebaseio.com`

**Database Secret**: 
`NlQAftbYHfU2waPg9ePnXbIauDXd2HzTar7hI9pc`

## Backend Integration

The Python backend will use Firebase Admin SDK to:
- Verify Firebase ID tokens from frontend
- Access Firestore database
- Manage user authentication server-side

## Security Notes

⚠️ **NEVER commit the service account JSON file to git!**
⚠️ Keep the database secret secure
⚠️ Use environment variables in production

## What's Already Configured

✅ Firebase Admin SDK added to requirements.txt
✅ Firebase credentials configured in .env
✅ Frontend uses Firebase Auth for login/register
✅ Backend will verify Firebase tokens

## Next Steps

1. Generate and download your service account key (follow steps above)
2. Save it as `firebase-service-account.json` in project root
3. Add to `.gitignore`
4. Backend will automatically initialize Firebase Admin SDK
