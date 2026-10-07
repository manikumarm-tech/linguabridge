import { existsSync } from 'node:fs';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { GeminiLLM } from './ai/gemini.js';
import { ClaudeLLM } from './ai/llm.js';
import { verify } from './auth.js';
import { BOTS } from './bots.js';
import { config } from './config.js';
import { q } from './db.js';
import { register } from './hub.js';
import { migrate } from './migrate.js';
import { Translator } from './pipeline/translate.js';
import { buildApi } from './routes/api.js';

async function seedBots() {
  for (const b of BOTS) {
    await q(
      `INSERT INTO users (handle,name,language,output_format,show_english,is_bot)
       VALUES ($1,$2,$3,'both',true,true) ON CONFLICT (handle) DO NOTHING`, [b.handle, b.name, b.language]);
  }
}

async function main() {
  if (!config.geminiKey && !config.anthropicKey) console.warn('Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set: translation calls will fail.');
  await migrate();
  await seedBots();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Gemini when its key is set (free tier), otherwise Claude
  const llm = config.geminiKey ? new GeminiLLM() : new ClaudeLLM();
  console.log(`translation model: ${config.geminiKey ? `Gemini ${config.geminiModel}` : `Claude ${config.model}`}`);
  app.use('/api', buildApi(new Translator(llm), llm));

  // the web app (mobile/ exported with `expo export -p web`), when it has been built
  const web = process.env.WEB_DIR ?? new URL('../../mobile/dist', import.meta.url).pathname;
  if (existsSync(`${web}/index.html`)) {
    app.use(express.static(web));
    app.get(/^\/(?!api\/|ws$|health$).*/, (_req, res) => res.sendFile(`${web}/index.html`));
    console.log(`serving web app from ${web}`);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url ?? '', 'http://x').searchParams.get('token') ?? '';
    const userId = verify(token);
    if (!userId) return ws.close(4401, 'unauthorized');
    register(userId, ws);
    const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 30_000);
    ws.on('close', () => clearInterval(ping));
  });

  server.listen(config.port, () => console.log(`EasyTalk API on :${config.port}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
