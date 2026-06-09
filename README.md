# nithcode

Terminal UI coding agent powered by DeepSeek Web API. A Claude Code alternative that works through a local proxy.

## Features

- **Terminal UI** — Full-screen chat interface with ANSI colors
- **Markdown Rendering** — Code blocks, bold, italic, inline code highlighting
- **Tool Execution** — Read/write files, patch code, list directories, run commands
- **Permission System** — Ask before executing tools or bypass for automation
- **Model Switching** — Switch between DeepSeek models on the fly (`/model`)
- **Reasoning Display** — View model's thinking process (Ctrl+O)
- **Server Logs** — Monitor proxy logs in real-time (Ctrl+J)
- **Session Management** — Clear chat with `/new`

## Prerequisites

1. **Node.js** v18+ installed
2. **FreeDeepseekAPI** proxy running on `localhost:9655`
3. **Chrome** browser (for proxy authentication)

## Installation

```bash
# Clone the repository
git clone https://github.com/ForgetMeAI/FreeDeepseekAPI.git
cd FreeDeepseekAPI

# Install dependencies
npm install

# Make nithcode globally available
npm link
```

Or manually copy `nithcode.js` and create a batch/shell script.

## Quick Start

### 1. Start the Proxy Server

In one terminal:

```bash
cd FreeDeepseekAPI
node server.js
```

Select option **3 (Start Server)** in the menu.

### 2. Authenticate (First Time)

If you haven't authenticated yet:

```bash
npm run deepseek:auth
```

This will open Chrome and save cookies for API access.

### 3. Launch nithcode

In another terminal:

```bash
nithcode
```

Or with specific model:

```bash
nithcode --model deepseek-v4-pro
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/model` | Open model selection menu |
| `/new` | Clear conversation history |
| `Ctrl+C` | Exit |
| `Ctrl+O` | Toggle reasoning overlay (thinking models) |
| `Ctrl+J` | Toggle server logs |
| `Ctrl+L` | Clear screen |

### Permission Modes

- **ask** (default) — Confirm each tool execution
- **bypassPermissions** — Auto-approve all tools

Launch with bypass mode:

```bash
nithcode --permission-mode bypassPermissions
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NITHCODE_MODEL` | `deepseek-chat` | Default model |
| `NITHCODE_BASE_URL` | `http://localhost:9655/v1` | API endpoint |
| `NITHCODE_API_KEY` | `nithcode-local` | API key |
| `NITHCODE_PERMISSION_MODE` | `ask` | Permission mode |
| `NITHCODE_MAX_TOKENS` | `8192` | Max tokens per request |

### Available Models

- `deepseek-chat` — General chat
- `deepseek-v3` — Latest V3 model
- `deepseek-reasoner` — Thinking/reasoning model
- `deepseek-r1` — R1 reasoning model
- `deepseek-v4-pro` — V4 Pro with reasoning
- `deepseek-chat-search` — Chat with web search
- `deepseek-expert` — Expert mode

## Architecture

```
┌─────────────┐     HTTP      ┌──────────────────┐     WebSocket     ┌─────────────┐
│  nithcode   │ ◄────────────► │ FreeDeepseekAPI  │ ◄───────────────► │  DeepSeek   │
│  (client)   │   localhost    │   (proxy)        │   cookies/auth    │   (web)     │
└─────────────┘    :9655       └──────────────────┘                   └─────────────┘
```

## Troubleshooting

### "Server not running"

Make sure FreeDeepseekAPI server is started in another terminal:

```bash
node server.js
# Select 3 (Start Server)
```

### "Model returned empty response"

- Check proxy logs with `Ctrl+J`
- Verify cookies are valid: `npm run deepseek:auth`
- Try switching model: `/model`

### "EADDRINUSE: address already in use"

Port 9655 is occupied. Kill existing Node processes:

```bash
# Windows
taskkill /F /IM node.exe

# Linux/Mac
killall node
```

## License

MIT — see [LICENSE](LICENSE)

## Credits

- Original proxy: [ForgetMeAI/FreeDeepseekAPI](https://github.com/ForgetMeAI/FreeDeepseekAPI)
- Powered by [DeepSeek](https://deepseek.com)
### Web search

```bash
curl -X POST http://localhost:9655/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat-search",
    "messages": [{"role": "user", "content": "Найди свежий факт про DeepSeek и ответь кратко."}],
    "stream": false
  }'
```

### Streaming

```bash
curl -N -X POST http://localhost:9655/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Напиши короткую шутку."}],
    "stream": true
  }'
```

### Anthropic Messages API

```bash
curl -X POST http://localhost:9655/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "max_tokens": 512,
    "messages": [{"role": "user", "content": "Ответь ровно OK"}],
    "stream": false
  }'
```

Для Claude Code можно указывать backend напрямую:

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:9655"
export ANTHROPIC_AUTH_TOKEN="dummy-key"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude --model deepseek-chat
```

### OpenAI Responses API

```bash
curl -X POST http://localhost:9655/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "input": "Ответь ровно OK",
    "stream": false
  }'
```

### Tool calling

FreeDeepseekAPI принимает:

- OpenAI `tools`;
- Anthropic `tools`;
- Responses API function tools.

Прокси просит DeepSeek вернуть строгий JSON tool call, но также умеет парсить fallback-форматы:

- `TOOL_CALL:`
- fenced JSON
- `<tool_call>...</tool_call>`

---

## 🧠 Модели

`GET /v1/models` возвращает только aliases, которые сейчас проверены и работают через этот proxy.

### Рабочие aliases

| Alias | Web mode | Reasoning | Web search | Комментарий |
| --- | --- | --- | --- | --- |
| `deepseek-chat` | `Быстрый` / `default` | нет | нет | базовый chat |
| `deepseek-v3` | `Быстрый` / `default` | нет | нет | совместимый alias |
| `deepseek-default` | `Быстрый` / `default` | нет | нет | совместимый alias |
| `deepseek-reasoner` | `Быстрый` / `default` | да | нет | `thinking_enabled=true` |
| `deepseek-r1` | `Быстрый` / `default` | да | нет | R1-compatible alias |
| `deepseek-chat-search` | `Быстрый` / `default` | нет | да | web search |
| `deepseek-default-search` | `Быстрый` / `default` | нет | да | web search alias |
| `deepseek-reasoner-search` | `Быстрый` / `default` | да | да | reasoning + search |
| `deepseek-r1-search` | `Быстрый` / `default` | да | да | R1-compatible + search |
| `deepseek-expert` | `Эксперт` / `expert` | нет | нет | Expert mode |
| `deepseek-v4-pro` | `Эксперт` / `expert` | да | нет | Expert + reasoning |

Полный маппинг:

```bash
curl http://localhost:9655/v1/model-capabilities
```

По официальной странице DeepSeek V4 Preview `deepseek-chat` и `deepseek-reasoner` сейчас route'ятся в `deepseek-v4-flash` non-thinking/thinking. В самом `chat.deepseek.com` direct stream точное имя чекпойнта не отдаётся (`model: ""`), поэтому proxy фиксирует одновременно web-режим (`default` / `Быстрый`) и актуальную официальную маршрутизацию (`DeepSeek-V4-Flash`).

Текущий вывод DeepSeek Web remote config показывает такие web-режимы:

- `default` / UI `Быстрый` — работает; поддерживает `thinking_enabled` и `search_enabled`.
- `expert` / UI `Эксперт` — работает через актуальный web-контракт (`x-client-version=2.0.0`) и поддерживает `thinking_enabled`. В `/v1/models` выдаются `deepseek-expert` без reasoning и `deepseek-v4-pro` как Expert + reasoning.
- `vision` / UI `Распознавание` — виден в remote config, но сейчас direct Web API возвращает `backend_err_by_model` (`Vision is temporarily unavailable`). Поэтому `deepseek-vision` скрыт из `/v1/models`.

Search для Expert по remote config недоступен, поэтому `deepseek-expert-search` остаётся unsupported.

---

## 🔌 Endpoints

| Method | Path | Назначение |
| --- | --- | --- |
| `GET` | `/` или `/health` | статус proxy |
| `GET` | `/v1/models` | список рабочих OpenAI-compatible aliases |
| `GET` | `/v1/model-capabilities` | полный маппинг aliases, real model, capabilities |
| `POST` | `/v1/chat/completions` | OpenAI-compatible Chat Completions |
| `POST` | `/v1/messages` | Anthropic Messages API shim |
| `POST` | `/v1/responses` | OpenAI Responses API shim |
| `GET` | `/v1/sessions` | активные локальные agent sessions |
| `POST` | `/reset-session?agent=<id>` | сбросить одну session |
| `POST` | `/reset-session?agent=all` | сбросить все sessions |

---

## 🖥 Open WebUI

Base URL для Open WebUI в Docker:

```text
http://host.docker.internal:9655/v1
```

Для локального запуска без Docker:

```text
http://localhost:9655/v1
```

API key можно указать любой: proxy сам ходит в DeepSeek Web через сохранённую browser-сессию.

---

## 🔐 Обновить логин

```bash
npm run auth
npm start
```

Если DeepSeek начал отвечать `401`, `403` или просит новый PoW/session — повторите `npm run auth` и обновите сохранённую browser-сессию.

Локальные файлы авторизации не должны попадать в GitHub:

- `deepseek-auth.json`
- `.chrome-profile-deepseek/`
- `.env`

Они уже добавлены в `.gitignore`.

---

## 🧪 Тесты

Синтаксическая проверка проекта:

```bash
npm test
```

Live smoke-тесты против запущенного локального proxy:

```bash
BASE_URL=http://127.0.0.1:9655 MODEL=deepseek-chat npm run test:live
```

---

## 📌 Статус проекта

FreeDeepseekAPI — экспериментальный web-chat proxy для локального использования и интеграций. Он зависит от текущего контракта DeepSeek Web Chat, поэтому при изменениях на стороне DeepSeek может потребоваться обновление auth/session logic или model mapping.

Если что-то перестало работать:

1. обновите логин через `npm run auth`;
2. проверьте `/v1/model-capabilities`;
3. повторите запрос на свежей сессии;
4. если проблема сохраняется — вероятно, DeepSeek изменил внутренний Web API.

---

<p align="center">
  <strong>ForgetMeAI</strong> · <a href="https://t.me/forgetmeai">Telegram</a>
</p>
