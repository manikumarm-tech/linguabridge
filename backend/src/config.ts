export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/linguabridge',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? '',
  geminiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-flash-latest',
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
};
