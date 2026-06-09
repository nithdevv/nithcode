#!/usr/bin/env node
/**
 * nithcode — Coding Agent powered by DeepSeek Web API
 * Claude Code alternative using local FreeDeepseekAPI proxy
 *
 * Usage:
 *   nithcode
 *   nithcode --model deepseek-reasoner
 *   nithcode --permission-mode bypassPermissions
 *   nithcode --base-url http://localhost:9655/v1
 *
 * Hotkeys:
 *   Ctrl+O — toggle reasoning overlay (thinking models)
 *   Ctrl+C — exit
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const http = require('http');
const os = require('os');

// ===================== AUTO-START SERVER =====================

const SERVER_PORT = 9655;
let serverProcess = null;
const LOG_FILE = path.join(os.tmpdir(), 'nithcode-server.log');
let showLogs = false;

function getServerLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return '(no logs yet)';
    const logs = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = logs.split('\n').filter(l => l.trim());
    return lines.slice(-30).join('\n'); // last 30 lines
  } catch {
    return '(cannot read logs)';
  }
}

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  if (!fs.existsSync(serverPath)) {
    console.error(`${C.red}❌ server.js not found at ${serverPath}${C.reset}`);
    process.exit(1);
  }

  // Check if server already running
  try {
    const check = execSync(`curl -s -o nul -w "%{http_code}" http://localhost:${SERVER_PORT}/health`, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (check.trim() === '200') {
      return; // already running
    }
  } catch {}

  // Server not running — show message and exit
  clearScreen();
  console.log(`${C.yellow}⚠️  Server not running on localhost:${SERVER_PORT}${C.reset}`);
  console.log(`${C.gray}Please start it manually in another terminal:${C.reset}`);
  console.log(`${C.cyan}  cd FreeDeepseekAPI${C.reset}`);
  console.log(`${C.cyan}  node server.js${C.reset}`);
  console.log(`${C.gray}Then select option 3 (Start Server) in the menu.${C.reset}\n`);
  process.exit(1);
}

function stopServer() {
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
  }
}

// ===================== ANSI COLORS =====================
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  strikethrough: '\x1b[9m',
  black: '\x1b[30m',
  red: '\x1b[38;2;255;100;100m',       // bright red
  green: '\x1b[38;2;100;255;150m',     // bright green
  yellow: '\x1b[38;2;255;235;100m',    // bright yellow
  blue: '\x1b[38;2;100;180;255m',      // bright blue
  magenta: '\x1b[38;2;255;120;255m',  // bright magenta
  cyan: '\x1b[38;2;100;255;255m',      // bright cyan
  white: '\x1b[38;2;255;255;255m',     // bright white
  gray: '\x1b[38;2;85;119;155m',      // steel blue-gray #55779b
  lightGray: '\x1b[38;2;200;200;200m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[48;2;80;20;20m',
  bgGreen: '\x1b[48;2;20;80;40m',
  bgYellow: '\x1b[48;2;80;70;20m',
  bgBlue: '\x1b[48;2;20;40;100m',
  bgMagenta: '\x1b[48;2;80;20;80m',
  bgCyan: '\x1b[48;2;20;80;80m',
  bgWhite: '\x1b[48;2;60;60;60m',
  bgGray: '\x1b[48;2;35;35;35m',
  clear: '\x1b[2J',
  clearLine: '\x1b[2K',
  cursorHome: '\x1b[H',
  cursorUp: (n) => `\x1b[${n}A`,
  cursorDown: (n) => `\x1b[${n}B`,
  cursorSave: '\x1b[s',
  cursorRestore: '\x1b[u',
  cursorHide: '\x1b[?25l',
  cursorShow: '\x1b[?25h',
};

// ===================== CONFIG =====================

const CONFIG = {
  baseUrl: process.env.NITHCODE_BASE_URL || 'http://localhost:9655/v1',
  apiKey: process.env.NITHCODE_API_KEY || 'nithcode-local',
  model: process.env.NITHCODE_MODEL || 'deepseek-chat',
  permissionMode: process.env.NITHCODE_PERMISSION_MODE || 'ask',
  maxTokens: Number(process.env.NITHCODE_MAX_TOKENS) || 8192,
  workingDir: process.cwd(),
};

const AVAILABLE_MODELS = [
  { id: 'deepseek-chat',           label: 'DeepSeek Chat',              reasoning: false },
  { id: 'deepseek-v3',             label: 'DeepSeek V3',                reasoning: false },
  { id: 'deepseek-default',        label: 'DeepSeek Default',           reasoning: false },
  { id: 'deepseek-reasoner',       label: 'DeepSeek Reasoner',          reasoning: true  },
  { id: 'deepseek-r1',             label: 'DeepSeek R1',                reasoning: true  },
  { id: 'deepseek-chat-search',    label: 'DeepSeek Chat + Search',     reasoning: false },
  { id: 'deepseek-default-search', label: 'DeepSeek Default + Search',  reasoning: false },
  { id: 'deepseek-reasoner-search',label: 'DeepSeek Reasoner + Search', reasoning: true  },
  { id: 'deepseek-r1-search',      label: 'DeepSeek R1 + Search',       reasoning: true  },
  { id: 'deepseek-expert',         label: 'DeepSeek Expert',            reasoning: false },
  { id: 'deepseek-v4-pro',         label: 'DeepSeek V4 Pro',            reasoning: true  },
];

const REASONING_MODELS = new Set([
  'deepseek-reasoner',
  'deepseek-r1',
  'deepseek-reasoner-search',
  'deepseek-r1-search',
  'deepseek-v4-pro',
]);

const SYSTEM_PROMPT = `You are nithcode — an autonomous coding agent.
Your job is to help users write, edit, and manage code projects.

Available tools (use ONLY these, no other actions):
- read_file(path) — read file contents
- write_file(path, content) — create or overwrite a file
- patch_file(path, search, replace) — replace a code block
- list_dir(path) — list directory contents
- execute_command(command[, cwd]) — run a shell command

When you need to use a tool, output EXACTLY:
TOOL_CALL: <tool_name>
arguments: <JSON arguments>

Example:
TOOL_CALL: read_file
arguments: {"path": "src/index.js"}

After each tool call, the user will send you the result.
Then continue with your plan.

Rules:
1. Always formulate a brief plan (1-2 sentences) before acting.
2. Use tools one at a time.
3. Never assume file contents — always read first.
4. For patch_file, search block must match EXACTLY (including whitespace).
5. Keep responses concise and actionable.
6. When done, output: DONE: <brief status>
7. NEVER ask the user what they want — just do it. If the request is unclear, make a reasonable assumption and proceed.
8. NEVER greet the user or ask how you can help. Start working immediately.
9. If the user asks a question that does NOT require file operations or commands, answer it directly in text with FULL EXPLANATION. Only use tools when actually needed for code/file work.
10. NEVER output just "DONE:" or a brief label. Always provide the actual answer, code, or explanation.`;

// ===================== STATE =====================

let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
let reasoningBuffer = '';
let showReasoning = false;
let isReasoningModel = REASONING_MODELS.has(CONFIG.model);
let totalTokens = { prompt: 0, completion: 0 };
let lastUsage = null;
let conversationHistory = [];
let pendingInput = '';
let isProcessing = false;
let modelMenuActive = false;
let modelMenuIndex = 0;

// ===================== UI HELPERS =====================

function clearScreen() {
  process.stdout.write(C.clear + C.cursorHome);
}

function line(char, width) {
  return char.repeat(width);
}

function center(text, width) {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function applyMarkdown(line) {
  // Code blocks ```...```
  if (line.trim().startsWith('```')) {
    return line; // keep as is, will be styled by caller
  }
  // Inline code `...`
  line = line.replace(/`([^`]+)`/g, `${C.yellow}$1${C.reset}`);
  // Bold **...**
  line = line.replace(/\*\*([^*]+)\*\*/g, `${C.bold}$1${C.reset}`);
  // Italic *...*
  line = line.replace(/\*([^*]+)\*/g, `${C.italic}$1${C.reset}`);
  return line;
}

function wrapText(text, width) {
  const lines = [];
  const paragraphs = text.split('\n');
  let inCodeBlock = false;
  let skipCodeBlockLang = false;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        // Opening ``` with language — skip showing it, just start code block styling
        skipCodeBlockLang = true;
        continue;
      } else {
        // Closing ``` — skip showing it
        skipCodeBlockLang = false;
        continue;
      }
    }
    if (inCodeBlock) {
      // Inside code block — pad to width for visual block
      const plain = stripAnsi(trimmed);
      const padding = Math.max(0, width - plain.length - 4);
      lines.push(`  ${C.yellow}${trimmed}${C.reset}${' '.repeat(padding)}`);
      continue;
    }
    let current = '';
    for (const word of para.split(' ')) {
      if ((current + word).length > width) {
        lines.push(applyMarkdown(current.trim()));
        current = word + ' ';
      } else {
        current += word + ' ';
      }
    }
    if (current.trim()) lines.push(applyMarkdown(current.trim()));
    if (!current.trim() && para === '') lines.push('');
  }
  return lines;
}

// ===================== RENDER =====================

function getTerminalSize() {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

function renderModelMenu(cols, contentLines) {
  contentLines.push(`${C.cyan}${line('═', cols)}${C.reset}`);
  contentLines.push(`${C.cyan}${C.bold}  SELECT MODEL${C.reset}`);
  contentLines.push(`${C.cyan}${line('═', cols)}${C.reset}`);
  contentLines.push('');

  for (let i = 0; i < AVAILABLE_MODELS.length; i++) {
    const m = AVAILABLE_MODELS[i];
    const isSelected = i === modelMenuIndex;
    const isCurrent = m.id === CONFIG.model;
    const marker = isSelected ? `${C.yellow}▶` : ' ';
    const name = isSelected ? `${C.yellow}${C.bold}${m.label}${C.reset}` : `${C.white}${m.label}${C.reset}`;
    const reasonBadge = m.reasoning ? `${C.magenta}[think]${C.reset}` : '';
    const currentBadge = isCurrent ? `${C.green}(current)${C.reset}` : '';
    contentLines.push(`  ${marker} ${name} ${C.gray}${m.id}${C.reset} ${reasonBadge} ${currentBadge}`);
  }

  contentLines.push('');
  contentLines.push(`${C.dim}  ↑/↓ navigate  •  Enter select  •  Esc cancel${C.reset}`);
  contentLines.push(`${C.cyan}${line('═', cols)}${C.reset}`);
}

function render() {
  const { rows, cols } = getTerminalSize();
  const inputHeight = 5;
  const statusHeight = 1;
  const bannerHeight = 12;
  const contentRows = Math.max(5, rows - inputHeight - statusHeight - 1);

  // Build content area
  let contentLines = [];

  // Banner ALWAYS at top
  const logoColor = '\x1b[38;2;200;120;50m'; // orange
  if (!modelMenuActive) {
    contentLines.push(`${logoColor}                                             ${C.reset}`);
    contentLines.push(`${logoColor}               ▄▄                   ▄▄       ${C.reset}`);
    contentLines.push(`${logoColor}      ▀▀  ██   ██                   ██       ${C.reset}`);
    contentLines.push(`${logoColor} ████▄ ██ ▀██▀▀ ████▄ ▄████ ▄███▄ ▄████ ▄█▀█▄ ${C.reset}`);
    contentLines.push(`${logoColor} ██ ██ ██  ██   ██ ██ ██    ██ ██ ██ ██ ██▄█▀ ${C.reset}`);
    contentLines.push(`${logoColor} ██ ██ ██▄ ██   ██ ██ ▀████ ▀███▀ ▀████ ▀█▄▄▄ ${C.reset}`);
    contentLines.push(`${C.gray}   Coding Agent — powered by DeepSeek Web API${C.reset}`);
    contentLines.push(`${C.gray}   Model: ${C.yellow}${CONFIG.model}${C.gray} | Permissions: ${CONFIG.permissionMode === 'bypassPermissions' ? C.red + 'bypass' : C.green + 'ask'}${C.reset}`);
    contentLines.push('');
    if (conversationHistory.length === 0) {
      contentLines.push(`${C.dim}Welcome! Type your request below. Ctrl+C to exit.${isReasoningModel ? ' Ctrl+O for reasoning.' : ''}${C.reset}`);
      contentLines.push(`${C.dim}Commands: /model — change model  •  /new — new chat${C.reset}`);
      contentLines.push('');
    }
  }

  // Model menu overlay
  if (modelMenuActive) {
    renderModelMenu(cols, contentLines);
  } else {
    // Conversation history
    for (const item of conversationHistory) {
      if (item.type === 'user') {
        contentLines.push(`${C.blue}┌${line('─', cols - 2)}┐${C.reset}`);
        const wrapped = wrapText(item.text, cols - 6);
        for (const w of wrapped) {
          contentLines.push(`${C.blue}│ ${C.reset}${C.bgGray}${C.black} ${truncate(w, cols - 6).padEnd(cols - 6)} ${C.reset}${C.blue} │${C.reset}`);
        }
        contentLines.push(`${C.blue}└${line('─', cols - 2)}┘${C.reset}`);
      } else if (item.type === 'agent') {
        const wrapped = wrapText(item.text, cols - 4);
        contentLines.push(`${C.green}🤖 ${C.bold}nithcode${C.reset}`);
        for (const w of wrapped) {
          contentLines.push(`  ${w}`);
        }
      } else if (item.type === 'tool') {
        contentLines.push(`${C.yellow}🔧 ${item.name}${C.reset}`);
        const wrapped = wrapText(item.result.substring(0, 500), cols - 4);
        for (const w of wrapped) {
          contentLines.push(`  ${C.gray}${w}${C.reset}`);
        }
      } else if (item.type === 'done') {
        contentLines.push(`${C.green}✅ ${C.bold}${item.text}${C.reset}`);
      } else if (item.type === 'error') {
        contentLines.push(`${C.red}❌ ${item.text}${C.reset}`);
      }
      contentLines.push('');
    }

    // Reasoning overlay (if enabled)
    if (showReasoning && reasoningBuffer) {
      contentLines.push(`${C.magenta}${line('═', cols)}${C.reset}`);
      contentLines.push(`${C.magenta}🧠 REASONING${C.reset}`);
      contentLines.push(`${C.magenta}${line('═', cols)}${C.reset}`);
      const wrapped = wrapText(reasoningBuffer, cols - 4);
      for (const w of wrapped.slice(0, 20)) {
        contentLines.push(`  ${C.magenta}${w}${C.reset}`);
      }
      contentLines.push(`${C.magenta}${line('═', cols)}${C.reset}`);
    }

    // Server logs overlay (if enabled)
    if (showLogs) {
      const logs = getServerLogs();
      contentLines.push(`${C.gray}${line('═', cols)}${C.reset}`);
      contentLines.push(`${C.gray}📋 SERVER LOGS${C.reset}`);
      contentLines.push(`${C.gray}${line('═', cols)}${C.reset}`);
      const wrapped = wrapText(logs, cols - 4);
      for (const w of wrapped.slice(0, 15)) {
        contentLines.push(`  ${C.gray}${w}${C.reset}`);
      }
      contentLines.push(`${C.gray}${line('═', cols)}${C.reset}`);
    }

    // If processing, show spinner
    if (isProcessing) {
      contentLines.push(`${C.yellow}⏳ Thinking...${C.reset}`);
    }
  }

  // Simple: show everything, let terminal scroll naturally
  // Just pad to fill contentRows
  while (contentLines.length < contentRows) {
    contentLines.unshift('');
  }
  // If too many, trim from top (keep latest at bottom)
  if (contentLines.length > contentRows) {
    contentLines = contentLines.slice(-contentRows);
  }

  // Render frame
  let output = C.cursorHome + C.cursorHide;

  // Content area — strictly only contentLines, no input text leaks here
  for (let i = 0; i < contentRows; i++) {
    output += C.clearLine + (contentLines[i] || '') + '\n';
  }

  // Input box — top/bottom lines only, no side borders
  output += C.clearLine + C.gray + line('─', cols) + C.reset + '\n';
  const inputDisplay = pendingInput || C.dim + 'Type your request here...' + C.reset;
  const visibleInput = pendingInput ? C.white + pendingInput + C.reset : inputDisplay;
  const inputPlainLen = stripAnsi(visibleInput).length;
  const padding = Math.max(0, cols - inputPlainLen - 2);
  output += C.clearLine + ' ' + visibleInput + C.reset + ' '.repeat(padding) + '\n';
  output += C.clearLine + C.gray + line('─', cols) + C.reset + '\n';

  // Status bar
  const promptTokens = lastUsage?.prompt_tokens ?? 0;
  const completionTokens = lastUsage?.completion_tokens ?? 0;
  const statusLeft = ` ${C.yellow}⚡ ${CONFIG.model}${C.reset} | ${C.green}Tokens: ${totalTokens.prompt + totalTokens.completion}${C.reset}`;
  const statusRight = `${C.gray}Dir: ${truncate(CONFIG.workingDir, 30)} | Ctrl+C exit${isReasoningModel ? ' | Ctrl+O reason' : ''} ${C.reset} `;
  const statusMid = Math.max(0, cols - stripAnsi(statusLeft).length - stripAnsi(statusRight).length);
  output += C.clearLine + C.bgBlue + C.white + statusLeft + ' '.repeat(statusMid) + statusRight + C.reset;

  process.stdout.write(output);
}

// ===================== API CLIENT =====================

async function chatCompletion(userMessage) {
  messages.push({ role: 'user', content: userMessage });

  const body = JSON.stringify({
    model: CONFIG.model,
    messages: messages.slice(-20),
    stream: false,
    max_tokens: CONFIG.maxTokens,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.baseUrl + '/chat/completions');
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
            return;
          }
          const choice = json.choices?.[0];
          const msg = choice?.message;
          if (msg?.reasoning_content) {
            reasoningBuffer = msg.reasoning_content;
          }
          lastUsage = json.usage || null;
          if (lastUsage) {
            totalTokens.prompt += lastUsage.prompt_tokens || 0;
            totalTokens.completion += lastUsage.completion_tokens || 0;
          }
          // Handle tool_calls from server
          if (msg?.tool_calls?.length > 0) {
            const tc = msg.tool_calls[0];
            const toolName = tc.function?.name;
            const toolArgs = tc.function?.arguments;
            if (toolName && toolArgs) {
              resolve(`TOOL_CALL: ${toolName}\narguments: ${toolArgs}`);
              return;
            }
          }
          resolve(msg?.content || '');
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}\nRaw: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================== TOOLS =====================

function toolReadFile(args) {
  const p = path.resolve(CONFIG.workingDir, args.path);
  if (!p.startsWith(CONFIG.workingDir)) throw new Error('Path outside working directory');
  if (!fs.existsSync(p)) throw new Error(`File not found: ${args.path}`);
  return fs.readFileSync(p, 'utf8');
}

function toolWriteFile(args) {
  const p = path.resolve(CONFIG.workingDir, args.path);
  if (!p.startsWith(CONFIG.workingDir)) throw new Error('Path outside working directory');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, args.content, 'utf8');
  return `Wrote ${args.content.length} chars to ${args.path}`;
}

function toolPatchFile(args) {
  const p = path.resolve(CONFIG.workingDir, args.path);
  if (!p.startsWith(CONFIG.workingDir)) throw new Error('Path outside working directory');
  if (!fs.existsSync(p)) throw new Error(`File not found: ${args.path}`);
  const content = fs.readFileSync(p, 'utf8');
  if (!content.includes(args.search)) {
    throw new Error(`Search block not found in ${args.path}`);
  }
  const newContent = content.replace(args.search, args.replace);
  if (newContent === content) {
    throw new Error('Replace had no effect');
  }
  fs.writeFileSync(p, newContent, 'utf8');
  return `Patched ${args.path}`;
}

function toolListDir(args) {
  const p = path.resolve(CONFIG.workingDir, args.path || '.');
  if (!p.startsWith(CONFIG.workingDir)) throw new Error('Path outside working directory');
  if (!fs.existsSync(p)) throw new Error(`Directory not found: ${args.path || '.'}`);
  const entries = fs.readdirSync(p, { withFileTypes: true });
  return entries.map(e => `${e.isDirectory() ? '[D]' : '[F]'} ${e.name}`).join('\n');
}

function toolExecuteCommand(args) {
  const { command, cwd } = args;
  const execCwd = cwd ? path.resolve(CONFIG.workingDir, cwd) : CONFIG.workingDir;
  try {
    const output = execSync(command, {
      cwd: execCwd,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return output || '(no output)';
  } catch (e) {
    return `EXIT CODE ${e.status}\nSTDOUT:\n${e.stdout || ''}\nSTDERR:\n${e.stderr || ''}`;
  }
}

const TOOLS = {
  read_file: toolReadFile,
  write_file: toolWriteFile,
  patch_file: toolPatchFile,
  list_dir: toolListDir,
  execute_command: toolExecuteCommand,
};

// ===================== PERMISSIONS =====================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function askQuestion(q) {
  return new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));
}

async function askPermission(toolName, args) {
  if (CONFIG.permissionMode === 'bypassPermissions') return true;

  // Pause rendering, show prompt
  process.stdout.write(C.cursorShow);
  const argPreview = JSON.stringify(args, null, 2).substring(0, 300);
  console.log(`\n${C.yellow}🔧 Tool: ${C.bold}${toolName}${C.reset}`);
  console.log(`${C.gray}Args: ${argPreview}${argPreview.length >= 300 ? '...' : ''}${C.reset}`);
  const answer = await askQuestion(`${C.cyan}Allow? [Y/n/a(ll)/q(uit)]: ${C.reset}`);
  process.stdout.write(C.cursorHide);

  if (answer.toLowerCase() === 'a') {
    CONFIG.permissionMode = 'bypassPermissions';
    return true;
  }
  if (answer.toLowerCase() === 'q') {
    console.log('Exiting...');
    process.exit(0);
  }
  return answer === '' || answer.toLowerCase().startsWith('y');
}

// ===================== PARSING =====================

function parseToolCall(text) {
  if (!text) return null;
  const match = text.match(/TOOL_CALL:\s*([\w_]+)\s*\narguments:\s*(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return { name: match[1], args: JSON.parse(match[2]) };
  } catch {
    return null;
  }
}

// ===================== INPUT HANDLING =====================

function setupInput() {
  if (!process.stdin.isTTY) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let inputBuffer = '';

  process.stdin.on('data', (chunk) => {
    inputBuffer += chunk;

    // Process complete keys from buffer
    while (inputBuffer.length > 0) {
      let key = '';
      let consumed = 0;

      // Check for escape sequences first
      if (inputBuffer.charCodeAt(0) === 0x1b) {
        // Try to match longest escape sequence first
        if (inputBuffer.startsWith('\u001b[A')) {
          key = '\u001b[A';
          consumed = 3;
        } else if (inputBuffer.startsWith('\u001b[B')) {
          key = '\u001b[B';
          consumed = 3;
        } else if (inputBuffer.startsWith('\u001b[C')) {
          key = '\u001b[C';
          consumed = 3;
        } else if (inputBuffer.startsWith('\u001b[D')) {
          key = '\u001b[D';
          consumed = 3;
        } else if (inputBuffer.startsWith('\u001b')) {
          key = '\u001b';
          consumed = 1;
        }
      } else if (inputBuffer.charCodeAt(0) === 0x0d || inputBuffer.charCodeAt(0) === 0x0a) {
        key = inputBuffer[0];
        consumed = 1;
      } else if (inputBuffer.charCodeAt(0) === 0x7f || inputBuffer.charCodeAt(0) === 0x08) {
        key = inputBuffer[0];
        consumed = 1;
      } else if (inputBuffer.charCodeAt(0) < 32) {
        // Control character
        key = inputBuffer[0];
        consumed = 1;
      } else {
        // Regular printable character
        key = inputBuffer[0];
        consumed = 1;
      }

      inputBuffer = inputBuffer.slice(consumed);

      // ======== PROCESS KEY ========

      // Model menu mode
      if (modelMenuActive) {
        if (key === '\u001b' || key === 'q' || key === '\u0003') {
          modelMenuActive = false;
          pendingInput = '';
          render();
          continue;
        }
        if (key === '\u001b[A') {
          modelMenuIndex = Math.max(0, modelMenuIndex - 1);
          render();
          continue;
        }
        if (key === '\u001b[B') {
          modelMenuIndex = Math.min(AVAILABLE_MODELS.length - 1, modelMenuIndex + 1);
          render();
          continue;
        }
        if (key === '\r' || key === '\n') {
          const selected = AVAILABLE_MODELS[modelMenuIndex];
          CONFIG.model = selected.id;
          isReasoningModel = selected.reasoning;
          modelMenuActive = false;
          pendingInput = '';
          conversationHistory.push({ type: 'agent', text: `Switched to ${selected.label} (${selected.id})` });
          render();
          continue;
        }
        continue;
      }

      // Ctrl+C
      if (key === '\u0003') {
        process.stdout.write(C.cursorShow + '\n');
        process.exit(0);
      }

      // Ctrl+O — toggle reasoning
      if (key === '\u000f') {
        if (!isReasoningModel) {
          conversationHistory.push({ type: 'error', text: 'Reasoning only for thinking models' });
        } else {
          showReasoning = !showReasoning;
        }
        render();
        continue;
      }

      // Ctrl+J — toggle server logs
      if (key === '\u000a') {
        showLogs = !showLogs;
        render();
        continue;
      }

      // Ctrl+L — clear screen
      if (key === '\u000c') {
        conversationHistory = [];
        render();
        continue;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        if (pendingInput.trim()) {
          const input = pendingInput.trim();
          if (input === '/new') {
            pendingInput = '';
            messages = [{ role: 'system', content: SYSTEM_PROMPT }];
            reasoningBuffer = '';
            conversationHistory = [];
            totalTokens = { prompt: 0, completion: 0 };
            lastUsage = null;
            render();
            continue;
          }
          conversationHistory.push({ type: 'user', text: input });
          pendingInput = '';
          isProcessing = true;
          render();
          handleUserInput(input).then(() => {
            isProcessing = false;
            render();
          });
        }
        continue;
      }

      // Backspace
      if (key === '\u007f' || key === '\b') {
        pendingInput = pendingInput.slice(0, -1);
        render();
        continue;
      }

      // Ignore escape sequences in normal mode
      if (key === '\u001b' || key.startsWith('\u001b')) {
        continue;
      }

      // Ignore control characters
      if (key.charCodeAt(0) < 32) {
        continue;
      }

      // Regular printable char
      pendingInput += key;

      // Auto-open /model menu
      if (pendingInput === '/model') {
        pendingInput = '';
        modelMenuActive = true;
        modelMenuIndex = AVAILABLE_MODELS.findIndex(m => m.id === CONFIG.model);
        if (modelMenuIndex === -1) modelMenuIndex = 0;
        render();
        continue;
      }

      render();
    }
  });

  process.stdout.on('resize', () => {
    render();
  });
}

// ===================== MAIN LOOP =====================

async function runTool(toolName, args) {
  const tool = TOOLS[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  const allowed = await askPermission(toolName, args);
  if (!allowed) {
    return 'User denied permission.';
  }

  conversationHistory.push({ type: 'tool', name: toolName, result: `[running ${toolName}...]` });
  render();

  const result = tool(args);
  // Replace placeholder
  conversationHistory[conversationHistory.length - 1] = { type: 'tool', name: toolName, result };
  return result;
}

async function handleUserInput(input) {
  try {
    const content = await chatCompletion(input);
    await processResponse(content);
  } catch (e) {
    conversationHistory.push({ type: 'error', text: e.message });
  }
}

async function processResponse(content) {
  // If content is empty but we have reasoning, show reasoning as fallback
  if (!content || !content.trim()) {
    if (reasoningBuffer) {
      conversationHistory.push({ type: 'agent', text: `[Thinking...]\n${reasoningBuffer}` });
    } else {
      conversationHistory.push({ type: 'error', text: 'Model returned empty response' });
    }
    return;
  }

  const toolCall = parseToolCall(content);

  if (content.includes('DONE:')) {
    const doneText = content.split('DONE:')[1]?.trim() || 'Task complete';
    conversationHistory.push({ type: 'done', text: doneText });
    messages = messages.slice(0, 1);
    reasoningBuffer = '';
    return;
  }

  if (!toolCall) {
    conversationHistory.push({ type: 'agent', text: content.trim() });
    return;
  }

  const beforeTool = content.split('TOOL_CALL:')[0].trim();
  if (beforeTool) {
    conversationHistory.push({ type: 'agent', text: beforeTool });
  }

  try {
    const result = await runTool(toolCall.name, toolCall.args);
    messages.push({ role: 'assistant', content: content });
    messages.push({ role: 'user', content: `[Tool Result: ${toolCall.name}]\n${result}` });

    isProcessing = true;
    render();
    const nextContent = await chatCompletion('');
    isProcessing = false;
    await processResponse(nextContent);
  } catch (e) {
    messages.push({ role: 'assistant', content: content });
    messages.push({ role: 'user', content: `[Tool Error: ${toolCall.name}]\n${e.message}` });

    isProcessing = true;
    render();
    const nextContent = await chatCompletion('');
    isProcessing = false;
    await processResponse(nextContent);
  }
}

async function checkServer() {
  try {
    await new Promise((resolve, reject) => {
      const url = new URL(CONFIG.baseUrl.replace('/v1', '') + '/health');
      http.get(url, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch {
    clearScreen();
    console.log(`${C.red}❌ Cannot connect to ${CONFIG.baseUrl}${C.reset}`);
    console.log(`${C.gray}Make sure FreeDeepseekAPI server is running:${C.reset}`);
    console.log(`${C.yellow}  cd FreeDeepseekAPI && npm start${C.reset}`);
    process.exit(1);
  }
}

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      CONFIG.model = args[i + 1];
      isReasoningModel = REASONING_MODELS.has(CONFIG.model);
    }
    if (args[i] === '--base-url' && args[i + 1]) CONFIG.baseUrl = args[i + 1];
    if (args[i] === '--permission-mode' && args[i + 1]) CONFIG.permissionMode = args[i + 1];
    if (args[i] === '--working-dir' && args[i + 1]) CONFIG.workingDir = path.resolve(args[i + 1]);
  }

  // Auto-start server if not running
  const serverReady = await startServer();
  if (serverReady === false) {
    console.log(`${C.red}❌ Server failed to start${C.reset}`);
    process.exit(1);
  }

  // Wait a bit for server to fully init
  await new Promise(r => setTimeout(r, 500));

  await checkServer();

  clearScreen();
  setupInput();
  render();
}

main().catch(e => {
  process.stdout.write(C.cursorShow);
  console.error(`${C.red}[FATAL] ${e.message}${C.reset}`);
  process.exit(1);
});
