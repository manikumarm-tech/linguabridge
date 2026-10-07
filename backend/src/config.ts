export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/linguabridge',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
};
