# AI Friends Chat

A local web-based messenger app where you can chat with AI personas powered by Ollama.

## Features

*   **Virtual Friends**: Create custom AI personas with unique personalities.
*   **Persistent Memory**: Each friend remembers your conversations. Memory is auto-summarized after interactions to keep context manageable.
*   **Group Chats**: Create groups with multiple AI friends. They can talk to you and each other!
    *   Random bot replies in groups.
    *   Bots can chain replies (50% chance) to simulate dynamic conversation.
*   **Local Storage**: All contacts, groups, and chat history are saved in your browser's Local Storage.
*   **Privacy**: Everything runs locally on your machine.

## Prerequisites

1.  **Install Ollama**: Download from [ollama.com](https://ollama.com).
2.  **Pull a Model**:
    ```powershell
    ollama pull gemma3:4b
    ```
    *(You can use other models too, just update the settings in the app)*

## How to Run

### 1. Start Ollama with CORS Enabled
**Crucial Step**: You must allow the web page to talk to Ollama.

**In PowerShell:**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

### 2. Open the App
Open `index.html` in your browser. Or use the github pages link to not worry about CORS.

## Usage

1.  **Settings**: Click the Gear icon  to set your model name (default: `gemma3:4b`).
2.  **Add Friend**: Click `+` to create a new persona. Give them a name and a system prompt (personality).
3.  **Chat**: Click on a friend to start chatting.
4.  **Profile**: Click "Profile / Memory" in a chat to see what the AI remembers about you or to edit their personality.
5.  **Groups**: Click the Group icon  to create a group chat with selected friends.


