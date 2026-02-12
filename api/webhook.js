// api/webhook.js
const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: text,
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const { message } = req.body;
  if (!message?.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const text = message.text;

  if (text.startsWith('/createrepo ')) {
    const args = text.replace('/createrepo ', '').split(' ');
    const repoName = args[0];
    const description = args.slice(1).join(' ') || '';

    try {
      const response = await axios.post(
        'https://api.github.com/user/repos',
        { name: repoName, description, private: false, auto_init: true },
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );
      await sendMessage(chatId, `✅ Repo created!\n${response.data.html_url}`);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message;
      await sendMessage(chatId, `❌ Failed: ${errMsg}`);
    }

  } else if (text.startsWith('/deleterepo ')) {
    const repoName = text.replace('/deleterepo ', '').trim();

    try {
      await axios.delete(
        `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );
      await sendMessage(chatId, `🗑️ Repo "${repoName}" deleted.`);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message;
      await sendMessage(chatId, `❌ Failed: ${errMsg}`);
    }

  } else if (text === '/start') {
    await sendMessage(chatId,
      '📦 /createrepo <name> <description> — create a repo\n🗑️ /deleterepo <name> — delete a repo'
    );
  }

  res.status(200).send('OK');
};
