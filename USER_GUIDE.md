# DinoQuest User Guide

Welcome to DinoQuest! This guide will help you get the app running and walk you through how to use its core features.

## 1. How to Access the App

To access the app locally on your machine, you must run both the backend API and the frontend client.

### Step 1: Start the Backend (API)
Open a terminal in your project directory (`/Users/chutung/dinoquest-journey`) and start the backend using Docker:

```bash
# Make sure your .env file is set up (cp .env.example .env)
docker-compose up -d api
```
*(The backend will now be running at `http://localhost:8122`)*

### Step 2: Start the Frontend
Open a separate terminal window in the project directory, and start the frontend:

```bash
# Install dependencies if you haven't yet
npm install

# Start the Vite development server
npm run dev
```

### Step 3: Open the App
The terminal will display the local address for the app (usually **`http://localhost:5173`** or **`http://localhost:3000`**).
Open your web browser and navigate to that address. 

*(Note: The frontend is configured to automatically proxy API requests to your backend at port 8122).*

---

## 2. Using DinoQuest

DinoQuest is designed as a gamified platform for families to manage tasks, quizzes, and rewards. Here is how you can use the main features:

### Getting Started
1. **Create an Account / Log In:** When you open the app, you will be prompted to log in or register. This creates your user account.
2. **Family Setup:**
   - **Create a Family:** You can create a new family group. You will become the "Owner" (Parent) of this family.
   - **Join a Family:** If a family already exists, you can join it by entering the **6-digit numerical invite code** provided by the family owner.

### For Parents (Family Owners)
- **Quests:** Navigate to the Quests section to create tasks for your children (e.g., "Clean your room", "Do math homework"). Assign a specific XP (Experience Points) reward for completing it.
- **Test Maker:** Use the test pipeline to create educational quizzes. You can preview, publish, and assign tests to your children. The system will handle automatic grading once submitted.
- **Rewards:** Create custom rewards that your children can purchase using the XP they earn.

### For Children (Members)
- **Completing Quests:** View your active assignments on your dashboard. When you finish a task, mark it as completed to earn XP.
- **Taking Tests:** Complete assigned quizzes. Your score will be tracked and you will earn points accordingly.
- **Pets & Leaderboard:** Use your hard-earned XP to unlock digital pets. Check out the family leaderboard to see how you stack up against your siblings!

## Troubleshooting

- **"API Connection Error"**: Ensure that the backend is running. You can check the health of the API by visiting `http://localhost:8122/api/health` in your browser.
- **"Blank Screen / Cannot reach localhost"**: Ensure the `npm run dev` script is running in your terminal, and verify the exact port it specifies (it might run on `5173` instead of `3000` depending on port availability).
