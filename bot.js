const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Secure bot token from .env
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('Error: BOT_TOKEN is not set in .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Directory to store user data
const dataDir = path.join(__dirname, 'user_data');
if (!fs.existsSync(dataDir)) {
    try {
        fs.mkdirSync(dataDir);
    } catch (err) {
        console.error('Error creating user_data directory:', err);
    }
}

// Persistent keyboard
const mainKeyboard = {
    reply_markup: {
        keyboard: [['Add Task', 'View Tasks'], ['Complete Task', 'Remove Task']],
        resize_keyboard: true,
        one_time_keyboard: false,
    },
};

// Load user tasks from file
function loadUserTasks(userId) {
    const filePath = path.join(dataDir, `${userId}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data).tasks || [];
        }
        return [];
    } catch (err) {
        console.error(`Error loading tasks for user ${userId}:`, err);
        return [];
    }
}

// Save user tasks to file
function saveUserTasks(userId, tasks) {
    const filePath = path.join(dataDir, `${userId}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify({ tasks }, null, 2), 'utf8');
    } catch (err) {
        console.error(`Error saving tasks for user ${userId}:`, err);
    }
}

// Start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    bot.sendMessage(
        chatId,
        `Welcome, ${msg.from.first_name}! Manage your tasks with ease.\nChoose an option below:`,
        mainKeyboard
    );
});

// Handle messages
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // Ignore commands to avoid duplicate handling
    if (text.startsWith('/')) return;

    // Load user's tasks
    let tasks = loadUserTasks(userId);

    if (text === 'Add Task') {
        bot.sendMessage(chatId, 'Enter the task description (max 100 characters):');
        bot.once('message', (taskMsg) => {
            if (taskMsg.from.id !== userId) return; // Ensure same user
            const taskText = taskMsg.text.trim();
            if (!taskText) {
                bot.sendMessage(chatId, 'Task cannot be empty.', mainKeyboard);
                return;
            }
            if (taskText.length > 100) {
                bot.sendMessage(chatId, 'Task is too long (max 100 characters).', mainKeyboard);
                return;
            }
            tasks.push({ text: taskText, status: 'pending' });
            saveUserTasks(userId, tasks);
            bot.sendMessage(chatId, `Task "${taskText}" added.`, mainKeyboard);
        });
    } else if (text === 'View Tasks') {
        if (tasks.length === 0) {
            bot.sendMessage(chatId, 'No tasks found.', mainKeyboard);
            return;
        }
        let taskList = 'Your Tasks:\n';
        tasks.forEach((task, index) => {
            taskList += `${index + 1}. ${task.text} (${task.status})\n`;
        });
        bot.sendMessage(chatId, taskList, mainKeyboard);
    } else if (text === 'Complete Task') {
        if (tasks.length === 0) {
            bot.sendMessage(chatId, 'No tasks to complete.', mainKeyboard);
            return;
        }
        const keyboard = tasks.map((task, index) => [
            { text: `${index + 1}. ${task.text} (${task.status})`, callback_data: `complete_${index}_${userId}` },
        ]);
        bot.sendMessage(chatId, 'Select a task to mark as completed:', {
            reply_markup: { inline_keyboard: keyboard },
        });
    } else if (text === 'Remove Task') {
        if (tasks.length === 0) {
            bot.sendMessage(chatId, 'No tasks to remove.', mainKeyboard);
            return;
        }
        const keyboard = tasks.map((task, index) => [
            { text: `${index + 1}. ${task.text} (${task.status})`, callback_data: `remove_${index}_${userId}` },
        ]);
        bot.sendMessage(chatId, 'Select a task to remove:', {
            reply_markup: { inline_keyboard: keyboard },
        });
    }
});

// Handle inline keyboard callbacks
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;

    if (!data) {
        bot.answerCallbackQuery(query.id, { text: 'Invalid action.' });
        return;
    }

    let tasks = loadUserTasks(userId);
    const [action, indexStr, callbackUserId] = data.split('_');
    const taskIndex = parseInt(indexStr);

    // Verify user
    if (parseInt(callbackUserId) !== userId) {
        bot.answerCallbackQuery(query.id, { text: 'You can only manage your own tasks!' });
        return;
    }

    if (taskIndex < 0 || taskIndex >= tasks.length) {
        bot.answerCallbackQuery(query.id, { text: 'Invalid task selection.' });
        return;
    }

    if (action === 'complete') {
        tasks[taskIndex].status = 'done';
        saveUserTasks(userId, tasks);
        bot.sendMessage(chatId, `Task "${tasks[taskIndex].text}" marked as done.`, mainKeyboard);
        bot.answerCallbackQuery(query.id);
    } else if (action === 'remove') {
        const removedTask = tasks.splice(taskIndex, 1)[0];
        saveUserTasks(userId, tasks);
        bot.sendMessage(chatId, `Task "${removedTask.text}" removed.`, mainKeyboard);
        bot.answerCallbackQuery(query.id);
    } else {
        bot.answerCallbackQuery(query.id, { text: 'Unknown action.' });
    }
});

// Log bot startup
console.log('Bot is running...');

// Handle errors
bot.on('polling_error', (err) => {
    console.error('Polling error:', err);
});