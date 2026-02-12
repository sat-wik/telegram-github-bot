const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS?.split(',').map(Number) || [];
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ─── Telegram Helpers ───────────────────────────────────────────────

async function sendMessage(chatId, text, options = {}) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...options,
  });
}

async function sendTyping(chatId) {
  await axios.post(`${TELEGRAM_API}/sendChatAction`, {
    chat_id: chatId,
    action: 'typing',
  });
}

// ─── Auth Check ─────────────────────────────────────────────────────

function isAuthorized(chatId) {
  if (ALLOWED_CHAT_IDS.length === 0) return true;
  return ALLOWED_CHAT_IDS.includes(chatId);
}

// ─── GitHub API Helper ──────────────────────────────────────────────

async function githubRequest(method, endpoint, data = null) {
  const config = {
    method,
    url: `https://api.github.com${endpoint}`,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  };
  if (data) config.data = data;
  return axios(config);
}

// ─── Command Handlers ───────────────────────────────────────────────

const commands = {
  async createrepo(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/createrepo <name> [description]`\n\nExample: `/createrepo my-app A cool new project`');

    const parts = args.split(' ');
    const repoName = parts[0];
    const description = parts.slice(1).join(' ') || '';
    const isPrivate = repoName.startsWith('_');

    await sendTyping(chatId);

    const response = await githubRequest('POST', '/user/repos', {
      name: repoName,
      description,
      private: isPrivate,
      auto_init: true,
    });

    const repo = response.data;
    await sendMessage(chatId,
      `✅ *Repo created!*\n\n` +
      `📦 *Name:* ${repo.name}\n` +
      `🔗 *URL:* ${repo.html_url}\n` +
      `🔒 *Visibility:* ${repo.private ? 'Private' : 'Public'}\n` +
      `📋 *Clone:* \`git clone ${repo.clone_url}\``
    );
  },

  async deleterepo(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/deleterepo <name>`\n\nExample: `/deleterepo my-old-repo`');

    const repoName = args.trim();
    await sendTyping(chatId);

    await githubRequest('DELETE', `/repos/${GITHUB_USERNAME}/${repoName}`);
    await sendMessage(chatId, `🗑️ Repo *"${repoName}"* has been deleted.`);
  },

  async listrepos(chatId, args) {
    await sendTyping(chatId);

    const page = parseInt(args) || 1;
    const perPage = 10;

    const response = await githubRequest('GET', `/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=owner`);
    const repos = response.data;

    if (repos.length === 0) {
      return sendMessage(chatId, page === 1 ? '📭 You have no repos.' : '📭 No more repos on this page.');
    }

    const list = repos.map((r, i) => {
      const num = (page - 1) * perPage + i + 1;
      const visibility = r.private ? '🔒' : '🌐';
      const stars = r.stargazers_count > 0 ? ` ⭐${r.stargazers_count}` : '';
      return `${num}. ${visibility} [${r.name}](${r.html_url})${stars}`;
    }).join('\n');

    let msg = `📦 *Your repos (page ${page}):*\n\n${list}`;
    if (repos.length === perPage) {
      msg += `\n\n➡️ Next page: \`/listrepos ${page + 1}\``;
    }

    await sendMessage(chatId, msg, { disable_web_page_preview: true });
  },

  async repoinfo(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/repoinfo <name>`\n\nExample: `/repoinfo my-app`');

    const repoName = args.trim();
    await sendTyping(chatId);

    const response = await githubRequest('GET', `/repos/${GITHUB_USERNAME}/${repoName}`);
    const r = response.data;

    const languagesRes = await githubRequest('GET', `/repos/${GITHUB_USERNAME}/${repoName}/languages`);
    const languages = Object.keys(languagesRes.data).join(', ') || 'None';

    await sendMessage(chatId,
      `📦 *${r.name}*\n\n` +
      `📝 ${r.description || 'No description'}\n` +
      `🔗 ${r.html_url}\n\n` +
      `🔒 *Visibility:* ${r.private ? 'Private' : 'Public'}\n` +
      `⭐ *Stars:* ${r.stargazers_count}\n` +
      `🍴 *Forks:* ${r.forks_count}\n` +
      `👀 *Watchers:* ${r.watchers_count}\n` +
      `🐛 *Open issues:* ${r.open_issues_count}\n` +
      `💻 *Languages:* ${languages}\n` +
      `🌿 *Default branch:* ${r.default_branch}\n` +
      `📅 *Created:* ${new Date(r.created_at).toLocaleDateString()}\n` +
      `🔄 *Last updated:* ${new Date(r.updated_at).toLocaleDateString()}`
    );
  },

  async togglevisibility(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/togglevisibility <name>`\n\nExample: `/togglevisibility my-app`');

    const repoName = args.trim();
    await sendTyping(chatId);

    const current = await githubRequest('GET', `/repos/${GITHUB_USERNAME}/${repoName}`);
    const isPrivate = !current.data.private;

    await githubRequest('PATCH', `/repos/${GITHUB_USERNAME}/${repoName}`, {
      private: isPrivate,
    });

    await sendMessage(chatId, `${isPrivate ? '🔒' : '🌐'} *${repoName}* is now *${isPrivate ? 'private' : 'public'}*.`);
  },

  async editrepo(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/editrepo <name> <new description>`\n\nExample: `/editrepo my-app My updated project description`');

    const parts = args.split(' ');
    const repoName = parts[0];
    const description = parts.slice(1).join(' ');

    if (!description) return sendMessage(chatId, '⚠️ Please provide a new description.');

    await sendTyping(chatId);

    await githubRequest('PATCH', `/repos/${GITHUB_USERNAME}/${repoName}`, {
      description,
    });

    await sendMessage(chatId, `✏️ *${repoName}* description updated to:\n_${description}_`);
  },

  async createissue(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/createissue <repo> <title> | <body>`\n\nExample: `/createissue my-app Fix login bug | The login button is broken on mobile`');

    const parts = args.split(' ');
    const repoName = parts[0];
    const rest = parts.slice(1).join(' ');
    const [title, body] = rest.split('|').map(s => s?.trim());

    if (!title) return sendMessage(chatId, '⚠️ Please provide an issue title.');

    await sendTyping(chatId);

    const response = await githubRequest('POST', `/repos/${GITHUB_USERNAME}/${repoName}/issues`, {
      title,
      body: body || '',
    });

    const issue = response.data;
    await sendMessage(chatId,
      `🐛 *Issue created!*\n\n` +
      `📦 *Repo:* ${repoName}\n` +
      `📝 *Title:* ${issue.title}\n` +
      `🔗 ${issue.html_url}`
    );
  },

  async listissues(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/listissues <repo>`\n\nExample: `/listissues my-app`');

    const repoName = args.trim();
    await sendTyping(chatId);

    const response = await githubRequest('GET', `/repos/${GITHUB_USERNAME}/${repoName}/issues?state=open&per_page=10`);
    const issues = response.data;

    if (issues.length === 0) {
      return sendMessage(chatId, `✅ No open issues in *${repoName}*.`);
    }

    const list = issues.map(i =>
      `• #${i.number} [${i.title}](${i.html_url})`
    ).join('\n');

    await sendMessage(chatId, `🐛 *Open issues in ${repoName}:*\n\n${list}`, { disable_web_page_preview: true });
  },

  async search(chatId, args) {
    if (!args) return sendMessage(chatId, '⚠️ Usage: `/search <query>`\n\nExample: `/search telegram bot`');

    await sendTyping(chatId);

    const response = await githubRequest('GET', `/search/repositories?q=${encodeURIComponent(args)}+user:${GITHUB_USERNAME}&per_page=5`);
    const repos = response.data.items;

    if (repos.length === 0) {
      return sendMessage(chatId, `🔍 No repos matching "${args}".`);
    }

    const list = repos.map(r =>
      `• ${r.private ? '🔒' : '🌐'} [${r.name}](${r.html_url}) — ${r.description || 'No description'}`
    ).join('\n');

    await sendMessage(chatId, `🔍 *Results for "${args}":*\n\n${list}`, { disable_web_page_preview: true });
  },

  async help(chatId) {
    await sendMessage(chatId,
      `🤖 *GitHub Bot Commands:*\n\n` +
      `📦 *Repos*\n` +
      `/createrepo \`<name> [desc]\` — Create repo (prefix \`_\` for private)\n` +
      `/deleterepo \`<name>\` — Delete a repo\n` +
      `/listrepos \`[page]\` — List your repos\n` +
      `/repoinfo \`<name>\` — Detailed repo info\n` +
      `/editrepo \`<name> <desc>\` — Update description\n` +
      `/togglevisibility \`<name>\` — Toggle public/private\n` +
      `/search \`<query>\` — Search your repos\n\n` +
      `🐛 *Issues*\n` +
      `/createissue \`<repo> <title> | <body>\` — Create issue\n` +
      `/listissues \`<repo>\` — List open issues\n\n` +
      `ℹ️ /help — Show this message\n` +
      `/myid — Get your chat ID for access control`
    );
  },

  async myid(chatId) {
    await sendMessage(chatId, `🆔 Your chat ID is: \`${chatId}\``);
  },
};

// ─── Register Autocomplete Commands with Telegram ───────────────────

async function registerCommands() {
  try {
    await axios.post(`${TELEGRAM_API}/setMyCommands`, {
      commands: [
        { command: 'createrepo', description: 'Create a new GitHub repo' },
        { command: 'deleterepo', description: 'Delete a GitHub repo' },
        { command: 'listrepos', description: 'List your repos' },
        { command: 'repoinfo', description: 'Get detailed repo info' },
        { command: 'editrepo', description: 'Update repo description' },
        { command: 'togglevisibility', description: 'Toggle repo public/private' },
        { command: 'search', description: 'Search your repos' },
        { command: 'createissue', description: 'Create an issue' },
        { command: 'listissues', description: 'List open issues' },
        { command: 'help', description: 'Show all commands' },
        { command: 'myid', description: 'Get your chat ID' },
      ],
    });
  } catch (e) {
    console.error('Failed to register commands:', e.message);
  }
}

registerCommands();

// ─── Main Handler ───────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const { message } = req.body;
    if (!message?.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (!isAuthorized(chatId)) {
      await sendMessage(chatId, '🚫 Unauthorized. Use `/myid` to get your chat ID and add it to the allowed list.');
      return res.status(200).send('OK');
    }

    const match = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)?$/s);
    if (!match) return res.status(200).send('OK');

    const command = match[1].toLowerCase();
    const args = match[2]?.trim() || '';

    if (commands[command]) {
      await commands[command](chatId, args);
    } else {
      await sendMessage(chatId, `❓ Unknown command. Type /help to see available commands.`);
    }
  } catch (error) {
    console.error('Bot error:', error?.response?.data || error.message);

    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        const status = error?.response?.status;
        let errorMsg = '❌ Something went wrong.';

        if (status === 404) errorMsg = '❌ Not found. Check the repo name and try again.';
        else if (status === 403) errorMsg = '❌ Permission denied. Check your GitHub token permissions.';
        else if (status === 422) errorMsg = '❌ Invalid request. The repo may already exist or the name is invalid.';
        else if (status === 401) errorMsg = '❌ Authentication failed. Check your GitHub token.';

        await sendMessage(chatId, errorMsg);
      }
    } catch (e) {
      console.error('Failed to send error message:', e.message);
    }
  }

  res.status(200).send('OK');
};
