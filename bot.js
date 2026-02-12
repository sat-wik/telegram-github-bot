// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// /createrepo <name> <description>
bot.onText(/\/createrepo (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].split(' ');
  const repoName = args[0];
  const description = args.slice(1).join(' ') || '';

  try {
    const response = await axios.post(
      'https://api.github.com/user/repos',
      {
        name: repoName,
        description: description,
        private: false,
        auto_init: true, // creates with a README
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    bot.sendMessage(chatId,
      `✅ Repo created!\n${response.data.html_url}`
    );
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    bot.sendMessage(chatId, `❌ Failed: ${errMsg}`);
  }
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Send /createrepo <name> <optional description> to create a GitHub repo.'
  );
});
