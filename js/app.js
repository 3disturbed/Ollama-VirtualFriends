class Store {
    constructor() {
        this.load();
    }

    load() {
        this.contacts = JSON.parse(localStorage.getItem('contacts')) || [];
        this.groups = JSON.parse(localStorage.getItem('groups')) || [];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            model: 'gemma3:4b',
            endpoint: 'http://127.0.0.1:11434/api/chat'
        };
    }

    save() {
        localStorage.setItem('contacts', JSON.stringify(this.contacts));
        localStorage.setItem('groups', JSON.stringify(this.groups));
        localStorage.setItem('settings', JSON.stringify(this.settings));
    }

    addContact(contact) {
        contact.id = Date.now().toString();
        contact.history = [];
        contact.memory = "No memory yet.";
        this.contacts.push(contact);
        this.save();
        return contact;
    }

    updateContact(id, updates) {
        const index = this.contacts.findIndex(c => c.id === id);
        if (index !== -1) {
            this.contacts[index] = { ...this.contacts[index], ...updates };
            this.save();
        }
    }

    deleteContact(id) {
        this.contacts = this.contacts.filter(c => c.id !== id);
        // Also remove from groups
        this.groups.forEach(g => {
            g.members = g.members.filter(mId => mId !== id);
        });
        this.save();
    }

    addGroup(group) {
        group.id = 'g_' + Date.now().toString();
        group.history = [];
        this.groups.push(group);
        this.save();
        return group;
    }

    addMessage(targetId, message, isGroup = false) {
        if (isGroup) {
            const group = this.groups.find(g => g.id === targetId);
            if (group) {
                group.history.push(message);
                this.save();
            }
        } else {
            const contact = this.contacts.find(c => c.id === targetId);
            if (contact) {
                contact.history.push(message);
                this.save();
            }
        }
    }

    getHistory(targetId, isGroup = false) {
        if (isGroup) {
            return this.groups.find(g => g.id === targetId)?.history || [];
        }
        return this.contacts.find(c => c.id === targetId)?.history || [];
    }
}

class OllamaService {
    constructor(store) {
        this.store = store;
    }

    async chat(messages, model = null) {
        const settings = this.store.settings;
        const useModel = model || settings.model;
        
        try {
            const response = await fetch(settings.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: useModel,
                    messages: messages,
                    stream: false
                })
            });

            if (!response.ok) throw new Error('Ollama API Error');
            const data = await response.json();
            return data.message.content;
        } catch (error) {
            console.error("Chat Error:", error);
            return "Error: Could not connect to Ollama.";
        }
    }

    async summarizeMemory(contactId, newInteraction) {
        const contact = this.store.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const currentMemory = contact.memory || "No prior memory.";
        const prompt = `
        You are a memory manager system. 
        Current Memory of the user: "${currentMemory}"
        New Interaction: "${newInteraction}"
        
        Task: Update the memory to include relevant details from the new interaction. Keep it concise but retain important facts about the user and the relationship. 
        Output ONLY the updated memory text.
        `;

        const messages = [{ role: 'user', content: prompt }];
        const newMemory = await this.chat(messages);
        
        this.store.updateContact(contactId, { memory: newMemory });
        // Dispatch event to update UI if viewing this contact
        document.dispatchEvent(new CustomEvent('memoryUpdated', { detail: { contactId, memory: newMemory } }));
    }
}

class App {
    constructor() {
        this.store = new Store();
        this.ollama = new OllamaService(this.store);
        this.currentChatId = null;
        this.isCurrentChatGroup = false;
        
        this.initUI();
        this.renderSidebar();
    }

    initUI() {
        // Elements
        this.els = {
            contactList: document.getElementById('contact-list'),
            groupList: document.getElementById('group-list'),
            chatArea: document.getElementById('chat-area'),
            emptyState: document.getElementById('empty-state'),
            messagesContainer: document.getElementById('messages'),
            messageInput: document.getElementById('message-input'),
            sendBtn: document.getElementById('send-btn'),
            chatTitle: document.getElementById('chat-title'),
            chatSubtitle: document.getElementById('chat-subtitle'),
            profileBtn: document.getElementById('profile-btn'),
            
            // Modals
            contactModal: document.getElementById('contact-modal'),
            groupModal: document.getElementById('group-modal'),
            settingsModal: document.getElementById('settings-modal'),
            profileModal: document.getElementById('profile-modal'),
            
            // Forms
            contactForm: document.getElementById('contact-form'),
            groupForm: document.getElementById('group-form'),
            settingsForm: document.getElementById('settings-form'),
            profileForm: document.getElementById('profile-form'),
        };

        // Event Listeners
        document.getElementById('add-contact-btn').onclick = () => this.openModal('contact-modal');
        document.getElementById('create-group-btn').onclick = () => this.openGroupModal();
        document.getElementById('settings-btn').onclick = () => this.openSettingsModal();
        
        // Close modals
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.onclick = (e) => {
                e.target.closest('.modal').classList.remove('active');
            };
        });

        // Tabs
        document.getElementById('tab-contacts').onclick = (e) => this.switchTab('contacts', e.target);
        document.getElementById('tab-groups').onclick = (e) => this.switchTab('groups', e.target);

        // Forms
        this.els.contactForm.onsubmit = (e) => this.handleContactSubmit(e);
        this.els.groupForm.onsubmit = (e) => this.handleGroupSubmit(e);
        this.els.settingsForm.onsubmit = (e) => this.handleSettingsSubmit(e);
        this.els.profileForm.onsubmit = (e) => this.handleProfileUpdate(e);

        // Chat
        this.els.sendBtn.onclick = () => this.sendMessage();
        this.els.messageInput.onkeypress = (e) => {
            if (e.key === 'Enter') this.sendMessage();
        };

        this.els.profileBtn.onclick = () => this.openProfileModal();

        // Memory Update Listener
        document.addEventListener('memoryUpdated', (e) => {
            if (this.currentChatId === e.detail.contactId && !this.isCurrentChatGroup) {
                // If profile modal is open, update it
                const memoryDisplay = document.getElementById('profile-memory-display');
                if (memoryDisplay) memoryDisplay.textContent = e.detail.memory;
            }
        });
    }

    switchTab(tab, btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (tab === 'contacts') {
            this.els.contactList.classList.remove('hidden');
            this.els.groupList.classList.add('hidden');
        } else {
            this.els.contactList.classList.add('hidden');
            this.els.groupList.classList.remove('hidden');
        }
    }

    renderSidebar() {
        // Contacts
        this.els.contactList.innerHTML = '';
        this.store.contacts.forEach(contact => {
            const el = document.createElement('div');
            el.className = `contact-item ${this.currentChatId === contact.id ? 'active' : ''}`;
            el.innerHTML = `
                <div class="avatar">${contact.name[0].toUpperCase()}</div>
                <div class="contact-info">
                    <div class="contact-name">${contact.name}</div>
                    <div class="contact-preview">${contact.personality.substring(0, 30)}...</div>
                </div>
            `;
            el.onclick = () => this.openChat(contact.id, false);
            this.els.contactList.appendChild(el);
        });

        // Groups
        this.els.groupList.innerHTML = '';
        this.store.groups.forEach(group => {
            const el = document.createElement('div');
            el.className = `contact-item ${this.currentChatId === group.id ? 'active' : ''}`;
            el.innerHTML = `
                <div class="avatar">G</div>
                <div class="contact-info">
                    <div class="contact-name">${group.name}</div>
                    <div class="contact-preview">${group.members.length} members</div>
                </div>
            `;
            el.onclick = () => this.openChat(group.id, true);
            this.els.groupList.appendChild(el);
        });
    }

    openChat(id, isGroup) {
        this.currentChatId = id;
        this.isCurrentChatGroup = isGroup;
        
        this.els.emptyState.classList.add('hidden');
        this.els.chatArea.classList.remove('hidden');
        
        // Update Header
        if (isGroup) {
            const group = this.store.groups.find(g => g.id === id);
            this.els.chatTitle.textContent = group.name;
            this.els.chatSubtitle.textContent = `${group.members.length} members`;
            this.els.profileBtn.classList.add('hidden'); // No profile for groups yet
        } else {
            const contact = this.store.contacts.find(c => c.id === id);
            this.els.chatTitle.textContent = contact.name;
            this.els.chatSubtitle.textContent = "Virtual Friend";
            this.els.profileBtn.classList.remove('hidden');
        }

        this.renderMessages();
        this.renderSidebar(); // To update active state
    }

    renderMessages() {
        this.els.messagesContainer.innerHTML = '';
        const history = this.store.getHistory(this.currentChatId, this.isCurrentChatGroup);
        
        history.forEach(msg => {
            this.appendMessageToUI(msg);
        });
        
        this.scrollToBottom();
    }

    appendMessageToUI(msg) {
        const div = document.createElement('div');
        div.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;
        
        let senderName = '';
        if (msg.role === 'assistant' && msg.senderId) {
            const sender = this.store.contacts.find(c => c.id === msg.senderId);
            senderName = sender ? sender.name : 'Unknown';
        }

        div.innerHTML = `
            ${senderName ? `<div class="message-sender">${senderName}</div>` : ''}
            ${msg.content}
        `;
        this.els.messagesContainer.appendChild(div);
    }

    scrollToBottom() {
        this.els.messagesContainer.scrollTop = this.els.messagesContainer.scrollHeight;
    }

    async sendMessage() {
        const text = this.els.messageInput.value.trim();
        if (!text) return;

        this.els.messageInput.value = '';
        
        // User Message
        const userMsg = { role: 'user', content: text, timestamp: Date.now() };
        this.store.addMessage(this.currentChatId, userMsg, this.isCurrentChatGroup);
        this.appendMessageToUI(userMsg);
        this.scrollToBottom();

        this.els.sendBtn.disabled = true;

        if (this.isCurrentChatGroup) {
            await this.handleGroupResponse(text);
        } else {
            await this.handleContactResponse(text);
        }

        this.els.sendBtn.disabled = false;
        this.scrollToBottom();
    }

    async handleContactResponse(userText) {
        const contact = this.store.contacts.find(c => c.id === this.currentChatId);
        
        // Construct context
        const systemPrompt = `
        You are ${contact.name}. 
        Personality: ${contact.personality}
        Memory of User: ${contact.memory}
        
        Reply to the user naturally as a friend in a chat app. Keep it relatively short.
        `;

        const history = this.store.getHistory(this.currentChatId, false);
        // Take last 10 messages for context window
        const recentHistory = history.slice(-10).map(h => ({
            role: h.role,
            content: h.content
        }));

        const messages = [
            { role: 'system', content: systemPrompt },
            ...recentHistory
        ];

        const responseText = await this.ollama.chat(messages);
        
        const botMsg = { 
            role: 'assistant', 
            content: responseText, 
            senderId: contact.id,
            timestamp: Date.now() 
        };
        
        this.store.addMessage(this.currentChatId, botMsg, false);
        this.appendMessageToUI(botMsg);

        // Trigger Memory Update in background
        this.ollama.summarizeMemory(contact.id, `User: ${userText}\n${contact.name}: ${responseText}`);
    }

    async handleGroupResponse(userText) {
        const group = this.store.groups.find(g => g.id === this.currentChatId);
        
        // 1. Pick a random member to reply
        const members = group.members;
        if (members.length === 0) return;

        const responderId = members[Math.floor(Math.random() * members.length)];
        await this.triggerBotReplyInGroup(group, responderId, userText);

        // 2. 50% chance for another reply (chaining)
        if (Math.random() > 0.5 && members.length > 1) {
            // Pick someone else
            const otherMembers = members.filter(m => m !== responderId);
            const nextResponderId = otherMembers[Math.floor(Math.random() * otherMembers.length)];
            
            // Small delay for realism
            setTimeout(async () => {
                await this.triggerBotReplyInGroup(group, nextResponderId, "Last message was from another bot.");
            }, 1000);
        }
    }

    async triggerBotReplyInGroup(group, contactId, contextTrigger) {
        const contact = this.store.contacts.find(c => c.id === contactId);
        
        const systemPrompt = `
        You are ${contact.name} in a group chat named "${group.name}".
        Personality: ${contact.personality}
        Memory of User: ${contact.memory}
        
        Reply to the conversation.
        `;

        const history = this.store.getHistory(group.id, true);
        const recentHistory = history.slice(-10).map(h => {
            // We need to map sender names for the bot to understand who said what
            let prefix = "";
            if (h.role === 'assistant' && h.senderId) {
                const sender = this.store.contacts.find(c => c.id === h.senderId);
                prefix = sender ? `${sender.name}: ` : "Friend: ";
            } else if (h.role === 'user') {
                prefix = "User: ";
            }
            return { role: 'user', content: prefix + h.content }; 
            // Note: We pass everything as 'user' role to Ollama with name prefixes for group context, 
            // or we could use 'system' for context. Simple approach: everything is external to this bot.
        });

        const messages = [
            { role: 'system', content: systemPrompt },
            ...recentHistory
        ];

        const responseText = await this.ollama.chat(messages);

        const botMsg = { 
            role: 'assistant', 
            content: responseText, 
            senderId: contact.id,
            timestamp: Date.now() 
        };

        this.store.addMessage(group.id, botMsg, true);
        this.appendMessageToUI(botMsg);
        this.scrollToBottom();
    }

    // Modal & Form Handlers
    openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    openGroupModal() {
        const container = document.getElementById('group-members-select');
        container.innerHTML = '';
        this.store.contacts.forEach(c => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.innerHTML = `
                <input type="checkbox" name="members" value="${c.id}"> ${c.name}
            `;
            container.appendChild(label);
        });
        this.openModal('group-modal');
    }

    openSettingsModal() {
        document.getElementById('setting-model').value = this.store.settings.model;
        document.getElementById('setting-endpoint').value = this.store.settings.endpoint;
        this.openModal('settings-modal');
    }

    openProfileModal() {
        if (this.isCurrentChatGroup) return;
        const contact = this.store.contacts.find(c => c.id === this.currentChatId);
        
        document.getElementById('edit-name').value = contact.name;
        document.getElementById('edit-personality').value = contact.personality;
        document.getElementById('profile-memory-display').textContent = contact.memory;
        
        // Delete button handler
        document.getElementById('delete-contact-btn').onclick = () => {
            if(confirm('Delete this contact?')) {
                this.store.deleteContact(contact.id);
                this.currentChatId = null;
                this.els.chatArea.classList.add('hidden');
                this.els.emptyState.classList.remove('hidden');
                this.renderSidebar();
                document.getElementById('profile-modal').classList.remove('active');
            }
        };

        this.openModal('profile-modal');
    }

    handleContactSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('contact-name').value;
        const personality = document.getElementById('contact-personality').value;
        
        this.store.addContact({ name, personality });
        this.renderSidebar();
        e.target.reset();
        document.getElementById('contact-modal').classList.remove('active');
    }

    handleGroupSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('group-name').value;
        const checkboxes = document.querySelectorAll('input[name="members"]:checked');
        const members = Array.from(checkboxes).map(cb => cb.value);
        
        if (members.length === 0) {
            alert("Select at least one member");
            return;
        }

        this.store.addGroup({ name, members });
        this.renderSidebar();
        e.target.reset();
        document.getElementById('group-modal').classList.remove('active');
    }

    handleSettingsSubmit(e) {
        e.preventDefault();
        const model = document.getElementById('setting-model').value;
        const endpoint = document.getElementById('setting-endpoint').value;
        
        this.store.settings = { model, endpoint };
        this.store.save();
        document.getElementById('settings-modal').classList.remove('active');
    }

    handleProfileUpdate(e) {
        e.preventDefault();
        const name = document.getElementById('edit-name').value;
        const personality = document.getElementById('edit-personality').value;
        
        this.store.updateContact(this.currentChatId, { name, personality });
        this.renderSidebar();
        this.els.chatTitle.textContent = name; // Update header
        document.getElementById('profile-modal').classList.remove('active');
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
