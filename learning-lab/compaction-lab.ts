#!/usr/bin/env bun

/**
 * Context Compaction Algorithm — 互动演示
 * ==========================================
 *
 * 这是一个教学脚本，逐步展示 LLM 编码 Agent 中「上下文压缩」算法的完整流程。
 *
 * 运行方式:
 *   bun run learning-lab/compaction-lab.ts
 *
 * 核心问题: 当对话上下文超出模型窗口时，需要对旧消息做摘要压缩。
 * 本算法解决三个关键决策:
 *   1. 切割点选择 — 只在合法的边界切割（user/assistant 消息，绝不切割 toolResult）
 *   2. Split Turn 检测 — 切割点落在 assistant 消息中间时，需要拆分 turn 并单独摘要前半部分
 *   3. 摘要策略 — 旧消息 → LLM 摘要，新消息 → 保留原文，摘要 + 新消息 = 新上下文
 *
 * 操作方式:
 *   [Space]  逐步推进算法阶段
 *   [q]      退出并打印摘要
 *   [s]      切换策略 (context-full / handoff)
 *   [↑↓/jk] 滚动会话列表
 *
 * 结构:
 *   1. ANSI 终端控制 + 颜色常量
 *   2. 类型定义 (消息、条目、切割结果)
 *   3. 模拟会话生成器 (生成一段长对话用于演示)
 *   4. 摘要生成 (模拟 LLM 产出摘要文本)
 *   5. 核心算法 (token 估算、切割点扫描、turn 边界查找、主切割逻辑)
 *   6. 渲染引擎 (左右分栏 TUI)
 *   7. 主循环 (阶段机 + 键盘处理 + 动画)
 */

const CSI = "\x1b[";
const cursorTo = (r: number, c: number) => `${CSI}${r};${c}H`;
const CLR_LINE = `${CSI}K`, CLR_SCREEN = `${CSI}J`;
const HIDE = `${CSI}?25l`, SHOW = `${CSI}?25h`;
const ALT_ON = `${CSI}?1049h`, ALT_OFF = `${CSI}?1049l`;
const RST = `${CSI}0m`;
function fg(c: number, t: string) { return `${CSI}${c}m${t}${RST}`; }
const S = {
  bold: (t: string) => `\x1b[1m${t}${RST}`,
  dim: (t: string) => `\x1b[2m${t}${RST}`,
  accent: (t: string) => fg(36, t),   white: (t: string) => fg(37, t),
  green: (t: string) => fg(32, t),    yellow: (t: string) => fg(33, t),
  red: (t: string) => fg(31, t),      gray: (t: string) => fg(90, t),
  hiWhite: (t: string) => fg(97, t),  blue: (t: string) => fg(34, t),
};
const BOX = { h: "\u2500", v: "\u2502", tl: "\u250c", tr: "\u2510", bl: "\u2514", br: "\u2518" };

class Terminal {
  raw = false;
  enter() { if (this.raw) return; process.stdout.write(ALT_ON + HIDE); if (process.stdin.isTTY) process.stdin.setRawMode(true); this.raw = true; }
  leave() { if (!this.raw) return; process.stdout.write(SHOW + ALT_OFF); if (process.stdin.isTTY) process.stdin.setRawMode(false); this.raw = false; }
  sz() { return { rows: process.stdout.rows || 35, cols: process.stdout.columns || 110 }; }
  cls() { process.stdout.write(cursorTo(1, 1) + CLR_SCREEN); }
  at(r: number, c: number, t: string) { process.stdout.write(cursorTo(r, c) + CLR_LINE + t); }
}

// === 类型定义: 模拟 LLM 会话的消息和条目结构 ===

type MsgRole = "user" | "assistant" | "toolResult";

interface SimMessage {
  role: MsgRole;
  content: string;
  tokens: number;
}

interface SessionEntry {
  id: number;
  type: "message" | "compaction";
  message?: SimMessage;
}

interface CutPointResult {
  firstKeptIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
  cutPointIndices: number[];
  accumulatedTokens: number;
  cutpoints: number[];
}

// === 模拟会话生成: 构造一段包含 8 个 turn 的长对话，用于触发上下文溢出 ===

function generateSession(): SessionEntry[] {
  const entries: SessionEntry[] = [];
  let id = 0;
  const M = (role: MsgRole, content: string, tokens: number) =>
    entries.push({ id: id++, type: "message", message: { role, content, tokens } });

  // Turn 1: User asks to build auth system
  M("user", "I need a complete user authentication system for our Express backend — signup, login, password reset, JWT tokens, and refresh token rotation.", 280);
  M("assistant", "I'll start by reading the existing project structure and understanding the current routing setup before making any changes.", 180);
  M("toolResult", "// src/app.ts — Express app setup\nimport express from 'express';\nimport { userRouter } from './routes/users';\nimport { errorHandler } from './middleware/error';\n\nconst app = express();\napp.use(express.json());\napp.use('/api/users', userRouter);\napp.use(errorHandler);\n\n// ... 180 more lines of middleware, config, database connection pool setup, CORS, helmet, rate limiting basics, logger setup...", 4200);
  M("assistant", "Good, the project is a standard Express app. I can see user routes already exist at `/api/users`. Now let me create the auth module with bcrypt hashing and JWT utilities.", 250);
  M("toolResult", "import bcrypt from 'bcrypt';\nimport jwt from 'jsonwebtoken';\nimport { randomBytes } from 'crypto';\n\nconst SALT_ROUNDS = 12;\nconst JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';\n\nexport async function hashPassword(password: string): Promise<string> {\n  return bcrypt.hash(password, SALT_ROUNDS);\n}\n\nexport async function verifyPassword(password: string, hash: string): Promise<boolean> {\n  return bcrypt.compare(password, hash);\n}\n\nexport function generateAccessToken(userId: string): string {\n  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '15m' });\n}\n\nexport function generateRefreshToken(): string {\n  return randomBytes(64).toString('hex');\n}\n\nexport function verifyToken(token: string): { sub: string } {\n  return jwt.verify(token, JWT_SECRET) as { sub: string };\n}\n// ... 40 more lines of token blacklisting, rotation logic, expiry checks", 3100);
  M("assistant", "Auth utilities are in place. Now let me create the auth routes — signup, login, logout, refresh, and password reset endpoints.", 200);
  M("toolResult", "import { Router } from 'express';\nimport { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken } from '../auth/utils';\nimport { User } from '../models/User';\nimport { sendPasswordResetEmail } from '../email/send';\n\nconst router = Router();\n\n// POST /api/auth/signup\nrouter.post('/signup', async (req, res, next) => {\n  try {\n    const { email, password, name } = req.body;\n\n    // Validate input\n    if (!email || !password || password.length < 8) {\n      return res.status(400).json({ error: 'Invalid input' });\n    }\n\n    // Check existing user\n    const existing = await User.findOne({ email });\n    if (existing) {\n      return res.status(409).json({ error: 'User already exists' });\n    }\n\n    const hashedPw = await hashPassword(password);\n    const user = await User.create({ email, password: hashedPw, name });\n    const accessToken = generateAccessToken(user.id);\n    const refreshToken = generateRefreshToken();\n\n    await user.updateOne({ refreshToken });\n\n    res.cookie('refreshToken', refreshToken, {\n      httpOnly: true,\n      secure: true,\n      sameSite: 'strict',\n      maxAge: 7 * 24 * 60 * 60 * 1000,\n      path: '/api/auth/refresh',\n    });\n\n    res.status(201).json({ accessToken, user: { id: user.id, email, name } });\n  } catch (err) {\n    next(err);\n  }\n});\n\n// POST /api/auth/login\nrouter.post('/login', async (req, res, next) => {\n  // ... 35 lines: find user, verify password, generate tokens, set cookie, return accessToken\n});\n\n// POST /api/auth/logout\nrouter.post('/logout', async (req, res, next) => {\n  // ... 15 lines: clear refresh token, clear cookie\n});\n\n// POST /api/auth/refresh\nrouter.post('/refresh', async (req, res, next) => {\n  // ... 25 lines: read cookie, verify refresh token, rotate, issue new access token\n});\n\n// POST /api/auth/forgot-password\nrouter.post('/forgot-password', async (req, res, next) => {\n  // ... 20 lines: find user, generate reset token, send email\n});\n\n// POST /api/auth/reset-password\nrouter.post('/reset-password', async (req, res, next) => {\n  // ... 20 lines: verify reset token, hash new password, update user\n});\n\nexport default router;", 5800);

  // Turn 2: Middleware + validation
  M("user", "Nice work! Now I need auth middleware for protected routes and input validation with Zod schemas. Also, let's add rate limiting on the login endpoint.", 260);
  M("assistant", "I'll create the auth middleware first — it'll verify JWT tokens, attach the user to the request, and handle token expiration gracefully.", 190);
  M("toolResult", "import { Request, Response, NextFunction } from 'express';\nimport { verifyToken, generateAccessToken } from '../auth/utils';\nimport { User } from '../models/User';\n\n// Extend Express Request type\ndeclare global {\n  namespace Express {\n    interface Request {\n      user?: { id: string; email: string; role: string };\n    }\n  }\n}\n\nexport async function authenticate(req: Request, res: Response, next: NextFunction) {\n  try {\n    const authHeader = req.headers.authorization;\n    if (!authHeader?.startsWith('Bearer ')) {\n      return res.status(401).json({ error: 'Missing or invalid authorization header' });\n    }\n\n    const token = authHeader.slice(7);\n\n    // Check if token is blacklisted\n    const isBlacklisted = await TokenBlacklist.exists({ token });\n    if (isBlacklisted) {\n      return res.status(401).json({ error: 'Token has been revoked' });\n    }\n\n    const payload = verifyToken(token);\n    const user = await User.findById(payload.sub).select('-password -refreshToken');\n\n    if (!user) {\n      return res.status(401).json({ error: 'User not found' });\n    }\n\n    req.user = { id: user.id, email: user.email, role: user.role };\n    next();\n  } catch (err) {\n    if (err instanceof jwt.TokenExpiredError) {\n      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });\n    }\n    if (err instanceof jwt.JsonWebTokenError) {\n      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });\n    }\n    next(err);\n  }\n}\n\nexport function requireRole(...roles: string[]) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    if (!req.user || !roles.includes(req.user.role)) {\n      return res.status(403).json({ error: 'Insufficient permissions' });\n    }\n    next();\n  };\n}\n\n// ... rate limiting implementation per user/IP with Redis-backed sliding window", 4500);
  M("assistant", "Now let me create the Zod validation schemas for all auth endpoints and wire up the rate limiter.", 160);
  M("toolResult", "import { z } from 'zod';\n\nexport const signupSchema = z.object({\n  email: z.string().email('Invalid email format'),\n  password: z.string().min(8, 'Password must be at least 8 characters')\n    .regex(/[A-Z]/, 'Must contain uppercase')\n    .regex(/[0-9]/, 'Must contain a number'),\n  name: z.string().min(1).max(100),\n});\n\nexport const loginSchema = z.object({\n  email: z.string().email(),\n  password: z.string().min(1),\n});\n\nexport const resetPasswordSchema = z.object({\n  token: z.string().min(1),\n  newPassword: z.string().min(8),\n});\n\nexport const forgotPasswordSchema = z.object({\n  email: z.string().email(),\n});\n\nexport function validate<T>(schema: z.ZodSchema<T>) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    const result = schema.safeParse(req.body);\n    if (!result.success) {\n      return res.status(400).json({\n        error: 'Validation failed',\n        details: result.error.flatten().fieldErrors,\n      });\n    }\n    req.body = result.data;\n    next();\n  };\n}", 2900);

  // Turn 3: Email sending
  M("user", "Great! Now let's implement the email service — we need transactional emails for signup confirmation, password reset, and welcome emails. Use SendGrid as the provider.", 230);
  M("assistant", "I'll create the email service abstraction first (so we can swap providers later), then implement the SendGrid adapter.", 150);
  M("toolResult", "import sgMail from '@sendgrid/mail';\n\nexport interface EmailOptions {\n  to: string;\n  subject: string;\n  html: string;\n  text?: string;\n}\n\nexport interface EmailProvider {\n  send(options: EmailOptions): Promise<void>;\n}\n\nclass SendGridProvider implements EmailProvider {\n  constructor(apiKey: string) {\n    sgMail.setApiKey(apiKey);\n  }\n\n  async send(options: EmailOptions): Promise<void> {\n    await sgMail.send({\n      to: options.to,\n      from: process.env.EMAIL_FROM || 'noreply@example.com',\n      subject: options.subject,\n      html: options.html,\n      text: options.text || options.html.replace(/<[^>]*>/g, ''),\n    });\n  }\n}\n\nclass ConsoleProvider implements EmailProvider {\n  async send(options: EmailOptions) {\n    console.log(`[EMAIL] To: ${options.to} | Subject: ${options.subject}`);\n  }\n}\n\nexport function createEmailProvider(): EmailProvider {\n  const apiKey = process.env.SENDGRID_API_KEY;\n  return apiKey ? new SendGridProvider(apiKey) : new ConsoleProvider();\n}\n\nexport async function sendWelcomeEmail(email: string, name: string): Promise<void> {\n  const provider = createEmailProvider();\n  await provider.send({\n    to: email,\n    subject: `Welcome to Our Platform, ${name}!`,\n    html: `<h1>Welcome!</h1><p>Hi ${name}, thanks for signing up. Let us know if you need anything.</p>`,\n  });\n}\n\nexport async function sendPasswordResetEmail(email: string, token: string): Promise<void> {\n  const provider = createEmailProvider();\n  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;\n  await provider.send({\n    to: email,\n    subject: 'Password Reset Request',\n    html: `<p>Reset your password: <a href=\"${resetUrl}\">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,\n  });\n}", 3500);

  // Turn 4: Database migration
  M("user", "We need a database migration for the users table — add email_verified, verification_token, last_login_at, and failed_login_attempts columns.", 200);
  M("assistant", "I'll create the migration file and update the User model to include the new fields.", 120);
  M("toolResult", "import { Migration } from '../db/migrate';\n\nexport const up: Migration = async (db) => {\n  await db.query(`\n    ALTER TABLE users\n    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,\n    ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),\n    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,\n    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,\n    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,\n    ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255),\n    ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP WITH TIME ZONE\n  `);\n\n  await db.query(`\n    CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);\n    CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);\n    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;\n  `);\n};\n\nexport const down: Migration = async (db) => {\n  await db.query(`\n    ALTER TABLE users\n    DROP COLUMN IF EXISTS email_verified,\n    DROP COLUMN IF EXISTS verification_token,\n    DROP COLUMN IF EXISTS last_login_at,\n    DROP COLUMN IF EXISTS failed_login_attempts,\n    DROP COLUMN IF EXISTS locked_until,\n    DROP COLUMN IF EXISTS refresh_token,\n    DROP COLUMN IF EXISTS refresh_token_expires_at\n  `);\n};", 3200);
  M("assistant", "Migration is ready. Now let me update the User model to handle the new fields and add account locking logic.", 140);
  M("toolResult", "import mongoose, { Schema, Document } from 'mongoose';\n\nexport interface IUser extends Document {\n  email: string;\n  password: string;\n  name: string;\n  role: 'user' | 'admin';\n  emailVerified: boolean;\n  verificationToken: string | null;\n  lastLoginAt: Date | null;\n  failedLoginAttempts: number;\n  lockedUntil: Date | null;\n  refreshToken: string | null;\n  refreshTokenExpiresAt: Date | null;\n  isLocked(): boolean;\n  recordLoginFailure(): Promise<void>;\n  recordLoginSuccess(): Promise<void>;\n}\n\nconst userSchema = new Schema<IUser>({\n  email: { type: String, required: true, unique: true, lowercase: true, trim: true },\n  password: { type: String, required: true, select: false },\n  name: { type: String, required: true },\n  role: { type: String, enum: ['user', 'admin'], default: 'user' },\n  emailVerified: { type: Boolean, default: false },\n  verificationToken: { type: String, default: null },\n  lastLoginAt: { type: Date, default: null },\n  failedLoginAttempts: { type: Number, default: 0 },\n  lockedUntil: { type: Date, default: null },\n  refreshToken: { type: String, default: null, select: false },\n  refreshTokenExpiresAt: { type: Date, default: null, select: false },\n}, { timestamps: true });\n\nconst MAX_FAILED_ATTEMPTS = 5;\nconst LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes\n\nuserSchema.methods.isLocked = function (): boolean {\n  if (!this.lockedUntil) return false;\n  if (Date.now() > this.lockedUntil.getTime()) {\n    this.lockedUntil = null;\n    this.failedLoginAttempts = 0;\n    return false;\n  }\n  return true;\n};\n\nuserSchema.methods.recordLoginFailure = async function (): Promise<void> {\n  this.failedLoginAttempts += 1;\n  if (this.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {\n    this.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);\n  }\n  await this.save();\n};\n\nuserSchema.methods.recordLoginSuccess = async function (): Promise<void> {\n  this.lastLoginAt = new Date();\n  this.failedLoginAttempts = 0;\n  this.lockedUntil = null;\n  await this.save();\n};\n\nexport const User = mongoose.model<IUser>('User', userSchema);", 5000);

  // Turn 5: Tests
  M("user", "Excellent! Now let's write comprehensive tests for everything — auth routes, middleware, email service, and the User model. I want at least 80% coverage.", 210);
  M("assistant", "I'll start with the auth route integration tests, then the middleware unit tests, and finally the email service tests.", 140);
  M("toolResult", "import { describe, it, expect, beforeAll, afterAll } from 'bun:test';\nimport request from 'supertest';\nimport { createApp } from '../src/app';\nimport { User } from '../src/models/User';\nimport { hashPassword } from '../src/auth/utils';\n\nconst app = createApp({ dbUri: process.env.TEST_DB_URI });\n\ndescribe('POST /api/auth/signup', () => {\n  beforeAll(async () => {\n    await User.deleteMany({});\n  });\n\n  it('should create a new user with valid data', async () => {\n    const res = await request(app)\n      .post('/api/auth/signup')\n      .send({ email: 'test@example.com', password: 'StrongP4ss!', name: 'Test User' });\n\n    expect(res.status).toBe(201);\n    expect(res.body.accessToken).toBeDefined();\n    expect(res.body.user.email).toBe('test@example.com');\n    expect(res.body.user.password).toBeUndefined();\n  });\n\n  it('should reject duplicate emails', async () => {\n    const res = await request(app)\n      .post('/api/auth/signup')\n      .send({ email: 'test@example.com', password: 'StrongP4ss!', name: 'Test User' });\n    expect(res.status).toBe(409);\n  });\n\n  it('should reject weak passwords', async () => {\n    const cases = [\n      { password: 'short', expectedError: 'at least 8' },\n      { password: 'nouppercase1', expectedError: 'uppercase' },\n      { password: 'NOLOWERCASE1', expectedError: 'lowercase' },\n      { password: 'NoNumbersHere', expectedError: 'number' },\n    ];\n    for (const { password } of cases) {\n      const res = await request(app)\n        .post('/api/auth/signup')\n        .send({ email: `test+${Date.now()}@example.com`, password, name: 'Test' });\n      expect(res.status).toBe(400);\n    }\n  });\n\n  it('should reject missing fields', async () => {\n    const res = await request(app)\n      .post('/api/auth/signup')\n      .send({ email: 'test@example.com' });\n    expect(res.status).toBe(400);\n  });\n});\n\ndescribe('POST /api/auth/login', () => {\n  beforeAll(async () => {\n    await User.create({\n      email: 'login-test@example.com',\n      password: await hashPassword('CorrectP4ss'),\n      name: 'Login Test',\n    });\n  });\n\n  it('should login with correct credentials', async () => {\n    const res = await request(app)\n      .post('/api/auth/login')\n      .send({ email: 'login-test@example.com', password: 'CorrectP4ss' });\n    expect(res.status).toBe(200);\n    expect(res.body.accessToken).toBeDefined();\n  });\n\n  it('should reject wrong password', async () => {\n    const res = await request(app)\n      .post('/api/auth/login')\n      .send({ email: 'login-test@example.com', password: 'WrongP4ss' });\n    expect(res.status).toBe(401);\n  });\n\n  it('should lock account after 5 failed attempts', async () => {\n    for (let i = 0; i < 5; i++) {\n      await request(app)\n        .post('/api/auth/login')\n        .send({ email: 'login-test@example.com', password: 'WrongP4ss' });\n    }\n    const res = await request(app)\n      .post('/api/auth/login')\n      .send({ email: 'login-test@example.com', password: 'CorrectP4ss' });\n    expect(res.status).toBe(423);\n    expect(res.body.error).toContain('locked');\n  });\n});\n\ndescribe('Auth Middleware', () => {\n  it('should reject requests without token', async () => {\n    const res = await request(app).get('/api/protected');\n    expect(res.status).toBe(401);\n  });\n\n  it('should reject expired tokens', async () => {\n    const expiredToken = jwt.sign({ sub: 'test' }, JWT_SECRET, { expiresIn: '0s' });\n    const res = await request(app)\n      .get('/api/protected')\n      .set('Authorization', `Bearer ${expiredToken}`);\n    expect(res.status).toBe(401);\n    expect(res.body.code).toBe('TOKEN_EXPIRED');\n  });\n});", 7200);

  // Turn 6: Code review feedback
  M("user", "I reviewed the code. Two things to fix: (1) the refresh token cookie should use `__Host-` prefix for security, and (2) we need request ID tracking via `X-Request-Id` header for audit logging. Also, add OpenAPI/Swagger docs.", 270);
  M("assistant", "Good catches. Let me fix the cookie prefix first, then add the request ID middleware, and finally set up Swagger documentation.", 160);
  M("toolResult", "// Fixed cookie configuration\nres.cookie('__Host-refreshToken', refreshToken, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'strict',\n  maxAge: 7 * 24 * 60 * 60 * 1000,\n  path: '/api/auth/refresh',\n});\n\n// Request ID middleware\nimport { v4 as uuidv4 } from 'uuid';\n\nexport function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {\n  const requestId = req.headers['x-request-id'] as string || uuidv4();\n  req.requestId = requestId;\n  res.setHeader('X-Request-Id', requestId);\n  next();\n}\n\n// Swagger setup\nimport swaggerJsdoc from 'swagger-jsdoc';\nimport swaggerUi from 'swagger-ui-express';\n\nconst swaggerSpec = swaggerJsdoc({\n  definition: {\n    openapi: '3.0.0',\n    info: { title: 'Auth API', version: '1.0.0' },\n    servers: [{ url: '/api' }],\n  },\n  apis: ['./src/routes/*.ts'],\n});\n\napp.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));\n\n/**\n * @openapi\n * /auth/signup:\n *   post:\n *     tags: [Auth]\n *     summary: Register a new user\n *     requestBody:\n *       required: true\n *       content:\n *         application/json:\n *           schema:\n *             type: object\n *             required: [email, password, name]\n *             properties:\n *               email:\n *                 type: string\n *                 format: email\n *               password:\n *                 type: string\n *                 minLength: 8\n *               name:\n *                 type: string\n *     responses:\n *       201:\n *         description: User created\n *       409:\n *         description: User already exists\n */\nrouter.post('/signup', validate(signupSchema), signupHandler);", 3800);

  // Turn 7: Edge cases
  M("user", "Almost done. Let's handle edge cases: concurrent refresh token races, token reuse detection, and graceful shutdown for database connections. Plus add health check and metrics endpoints.", 250);
  M("assistant", "I'll handle these one by one — starting with the refresh token rotation using database transactions to prevent races.", 140);
  M("toolResult", "// Refresh token with race protection\nasync function rotateRefreshToken(userId: string, oldToken: string): Promise<{ accessToken: string; refreshToken: string }> {\n  const session = await mongoose.startSession();\n  session.startTransaction();\n\n  try {\n    const user = await User.findById(userId).select('+refreshToken').session(session);\n    if (!user) throw new AppError(404, 'User not found');\n\n    // Token reuse detection: if the presented token doesn't match the stored one,\n    // this is a reused token — revoke all tokens (potential theft)\n    if (user.refreshToken !== oldToken) {\n      user.refreshToken = null;\n      user.refreshTokenExpiresAt = null;\n      await user.save({ session });\n      await session.commitTransaction();\n      throw new AppError(401, 'Token reused — all sessions revoked for security');\n    }\n\n    const accessToken = generateAccessToken(userId);\n    const refreshToken = generateRefreshToken();\n\n    user.refreshToken = refreshToken;\n    user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);\n    await user.save({ session });\n\n    await session.commitTransaction();\n    return { accessToken, refreshToken };\n  } catch (err) {\n    await session.abortTransaction();\n    throw err;\n  } finally {\n    session.endSession();\n  }\n}\n\n// Graceful shutdown\nprocess.on('SIGTERM', async () => {\n  console.log('SIGTERM received — closing HTTP server and DB connections...');\n  server.close(async () => {\n    await mongoose.disconnect();\n    await redis.quit();\n    console.log('Shutdown complete');\n    process.exit(0);\n  });\n});\n\n// Health check\nrouter.get('/health', (req, res) => {\n  res.json({\n    status: 'ok',\n    uptime: process.uptime(),\n    timestamp: new Date().toISOString(),\n    checks: {\n      db: mongoose.connection.readyState === 1 ? 'ok' : 'error',\n      redis: redis.status === 'ready' ? 'ok' : 'error',\n    },\n  });\n});\n\n// Metrics\nimport prometheus from 'prom-client';\nconst httpRequestDuration = new prometheus.Histogram({\n  name: 'http_request_duration_seconds',\n  help: 'Request duration in seconds',\n  labelNames: ['method', 'route', 'status'],\n});\n\napp.use((req, res, next) => {\n  const end = httpRequestDuration.startTimer();\n  res.on('finish', () => {\n    end({ method: req.method, route: req.route?.path || req.path, status: res.statusCode.toString() });\n  });\n  next();\n});\n\nrouter.get('/metrics', async (req, res) => {\n  res.set('Content-Type', prometheus.register.contentType);\n  res.end(await prometheus.register.metrics());\n});", 6000);

  // Turn 8: Docker & deployment
  M("user", "Last thing — let's dockerize this and add the CI pipeline config. We're deploying to Fly.io with a PostgreSQL database.", 180);
  M("assistant", "I'll create the Dockerfile, docker-compose for local dev, the Fly.io config, and a GitHub Actions CI pipeline.", 140);
  M("toolResult", "# Dockerfile\nFROM oven/bun:1 AS builder\nWORKDIR /app\nCOPY package.json bun.lock ./\nRUN bun install --frozen-lockfile\nCOPY . .\nRUN bun run build\n\nFROM oven/bun:1-slim AS runner\nWORKDIR /app\nRUN addgroup --system app && adduser --system --ingroup app app\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/package.json ./\nUSER app\nENV NODE_ENV=production\nEXPOSE 3000\nCMD [\"bun\", \"dist/index.js\"]\n\n# docker-compose.yml\nversion: '3.8'\nservices:\n  app:\n    build: .\n    ports: ['3000:3000']\n    environment:\n      - DATABASE_URL=postgres://user:pass@db:5432/auth\n      - REDIS_URL=redis://redis:6379\n    depends_on: [db, redis]\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_USER: user\n      POSTGRES_PASSWORD: pass\n      POSTGRES_DB: auth\n    volumes: [pgdata:/var/lib/postgresql/data]\n  redis:\n    image: redis:7-alpine\nvolumes:\n  pgdata:\n\n# fly.toml\napp = 'auth-service'\nprimary_region = 'iad'\n\n[build]\n  builder = 'dockerfile'\n\n[env]\n  NODE_ENV = 'production'\n  PORT = '3000'\n\n[[services]]\n  internal_port = 3000\n  protocol = 'tcp'\n\n  [[services.ports]]\n    handlers = ['http']\n    port = 80\n\n  [[services.ports]]\n    handlers = ['tls', 'http']\n    port = 443\n\n  [services.concurrency]\n    type = 'connections'\n    hard_limit = 25\n    soft_limit = 20\n\n# .github/workflows/ci.yml\nname: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    services:\n      postgres:\n        image: postgres:16-alpine\n        env:\n          POSTGRES_USER: test\n          POSTGRES_PASSWORD: test\n        ports: ['5432:5432']\n      redis:\n        image: redis:7-alpine\n        ports: ['6379:6379']\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v1\n      - run: bun install --frozen-lockfile\n      - run: bun test --coverage\n      - run: bun run lint\n      - run: bun run typecheck", 4800);

  return entries;
}

// === 摘要生成 (模拟): 实际场景中由 LLM 产出，这里用启发式方法生成摘要文本 ===

function generateSimulatedSummary(entries: SessionEntry[], start: number, end: number): string {
  // Pair each user message with the FIRST assistant response that follows it
  const turns: { user: string; assistant?: string }[] = [];

  for (let i = start; i < end; i++) {
    const m = entries[i]?.message;
    if (!m) continue;
    if (m.role === "user") {
      turns.push({ user: m.content.split("\n")[0]! });
    } else if (m.role === "assistant" && turns.length > 0 && !turns[turns.length - 1]!.assistant) {
      turns[turns.length - 1]!.assistant = m.content.split("\n")[0]!;
    }
  }

  const totalTokens = entries.slice(start, end).reduce((s, e) => s + (e.message?.tokens ?? 0), 0);

  const lines: string[] = [];
  lines.push("Summary of previous conversation:");
  lines.push("");

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    lines.push(`  Turn ${i + 1}. ${trunc(t.user, 52)}`);
    if (t.assistant) {
      lines.push(`     → ${trunc(t.assistant, 48)}`);
    }
  }

  lines.push("");
  lines.push(`─── ${turns.length} turns summarized, ${fmtTok(totalTokens)} tokens compacted ───`);

  return lines.join("\n");
}

function generateTurnPrefixSummary(entries: SessionEntry[], start: number, end: number): string {
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const m = entries[i]?.message;
    if (!m) continue;
    const line = m.content.split("\n")[0]!;
    if (m.role === "user") parts.push(`User asked: ${trunc(line, 50)}`);
    else if (m.role === "assistant") parts.push(`Assistant began: ${trunc(line, 44)}`);
  }
  return parts.join("\n");
}

// === Token 估算 (启发式): 英文约 4 字符/token — 精度不重要，仅用于演示 ===

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// === 扫描合法切割点: 只选 user/assistant，跳过 toolResult (toolResult 必须紧跟 tool call) ===

function findValidCutPoints(entries: SessionEntry[], start: number, end: number): number[] {
  const points: number[] = [];
  for (let i = start; i < end; i++) {
    const entry = entries[i];
    if (entry.type === "compaction") { points.push(i); continue; }
    if (!entry.message) continue;
    const role = entry.message.role;
    if (role === "toolResult") continue; // never cut at toolResult — must follow its tool call
    if (role === "user" || role === "assistant") points.push(i);
  }
  return points;
}

// === 查找 Turn 起点: 当切割点落在 assistant 消息上，向前查找最近的 user 消息作为 turn 边界 ===

function findTurnStart(entries: SessionEntry[], index: number, start: number): number {
  for (let i = index; i >= start; i--) {
    if (entries[i].type === "compaction") return i + 1;
    if (entries[i]?.message?.role === "user") return i;
  }
  return -1;
}

// === 核心算法 findCutPoint: 反向累积 token → 找到合法切割点 → 检测 Split Turn ===
//
// 流程:
//   1. 扫描所有合法切割点 (跳过 toolResult)
//   2. 从最新消息反向遍历，逐条累加 token 估算值
//   3. 当累积量 >= keepRecentTokens 时停止
//   4. 找到最近的合法切割点作为分界
//   5. 如果切割点不是 user 消息，向前查找最近的 user → 标记为 Split Turn
//   6. Split Turn 时，turn 前半部分单独摘要，剩余部分保留原文

function findCutPoint(
  entries: SessionEntry[],
  start: number,
  end: number,
  keepRecentTokens: number,
): CutPointResult {
  const cutpoints = findValidCutPoints(entries, start, end);
  if (cutpoints.length === 0) {
    return { firstKeptIndex: start, turnStartIndex: -1, isSplitTurn: false, cutPointIndices: [], accumulatedTokens: 0, cutpoints: [] };
  }

  let accumulated = 0;
  let cutIndex = cutpoints[0];
  const visited: number[] = [];

  // Walk backwards from newest, accumulating token estimates
  for (let i = end - 1; i >= start; i--) {
    const e = entries[i];
    if (e.type !== "message" || !e.message) continue;
    accumulated += e.message.tokens;
    visited.push(i);

    if (accumulated >= keepRecentTokens) {
      // Find closest valid cut point at or after this entry
      let found = false;
      for (const cp of cutpoints) {
        if (cp >= i) { cutIndex = cp; found = true; break; }
      }
      if (!found) cutIndex = cutpoints[cutpoints.length - 1]; // fallback: newest valid cut point
      break;
    }
  }

  // Back-scan: include non-message entries (settings changes, labels) before cut
  while (cutIndex > start) {
    const prev = entries[cutIndex - 1];
    if (prev.type === "compaction") break;
    if (prev.type === "message") break;
    cutIndex--;
  }

  const cutEntry = entries[cutIndex];
  const isUserMsg = cutEntry?.message?.role === "user";
  const turnStart = isUserMsg ? -1 : findTurnStart(entries, cutIndex, start);

  return {
    firstKeptIndex: cutIndex,
    turnStartIndex: turnStart,
    isSplitTurn: !isUserMsg && turnStart !== -1,
    cutPointIndices: visited,
    accumulatedTokens: accumulated,
    cutpoints,
  };
}

// === 格式化工具: token 数字显示、文本截断、角色标签 ===

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function roleLabel(role: MsgRole): string {
  switch (role) {
    case "user": return "U ";
    case "assistant": return "A ";
    case "toolResult": return "TR";
  }
}


// === 渲染引擎: 左右分栏 TUI — 左栏显示会话条目，右栏显示算法状态 ===

type Phase = "show_all" | "finding_cutpoints" | "walking_back" | "cut_found" | "split_check" | "result";
type Strategy = "context-full" | "handoff";

interface RenderState {
  phase: Phase;
  strategy: Strategy;
  entries: SessionEntry[];
  result: CutPointResult | null;
  contextWindow: number;
  keepTokens: number;
  totalTokens: number;
  scrollOffset: number;
  walkStep: number; // for walk animation
  highlightEntry: number; // entry being examined in backward walk
  historySummary: string; // simulated summary for result phase
  turnPrefixSummary: string; // simulated turn-prefix summary for result phase
}

const TOTAL_STEPS = 6;
const STEP_LABELS: Record<Phase, string> = {
  show_all: "查看完整会话",
  finding_cutpoints: "扫描有效切割点",
  walking_back: "反向累积 Token",
  cut_found: "确定切割位置",
  split_check: "检测 Split Turn",
  result: "压缩完成 — 查看结果",
};


function render(term: Terminal, st: RenderState) {
  const { rows, cols } = term.sz();
  term.cls();

  const { entries, result, contextWindow, keepTokens, totalTokens, phase, scrollOffset, walkStep, highlightEntry, strategy } = st;

  // Layout: left 48 cols for entry list, right side for algorithm info
  const listW = Math.min(52, Math.floor(cols * 0.55));
  const infoX = listW + 2;

  // === Top bar ===
  const stepNum = Object.keys(STEP_LABELS).indexOf(phase) + 1;
  const stepLabel = STEP_LABELS[phase];
  term.at(1, 1, S.accent(S.bold(` Context Compaction — 上下文压缩算法演示 `)) +
    S.hiWhite(`  Step ${stepNum}/${TOTAL_STEPS}: ${stepLabel}`));
  term.at(2, 1, S.dim("━".repeat(cols - 1)));
  term.at(3, 1, S.dim(`[Space]下一步  [q]退出  [s]切换策略  [↑↓/jk]滚动`));

  // === Context gauge ===
  const overflow = totalTokens > contextWindow;
  const barLabel = overflow
    ? S.red(`Context: ${fmtTok(totalTokens)} / ${fmtTok(contextWindow)}  OVERFLOW!`)
    : S.white(`Context: ${fmtTok(totalTokens)} / ${fmtTok(contextWindow)}`);
  term.at(4, 2, barLabel);
  term.at(4, barLabel.length + 3, `Keep budget: ${fmtTok(keepTokens)}  |  Strategy: ${strategy === "context-full" ? "context-full" : "handoff"}`);

  // === Entry list header ===
  const listHeaderY = 5;
  const isResultPhase = phase === "result" && result;
  const listTitle = isResultPhase ? " Compaction Result — 压缩结果 " : " Session Entries ";
  const listTitleColor = isResultPhase ? S.green : S.gray;
  hdrBox(term, listHeaderY, 1, listW, BOX, listTitleColor, listTitle);
  const listStartY = listHeaderY + 3;
  const listEndY = rows - 3;

  // Determine which entries are kept/summarized/prefix based on phase
  const showCut = (phase === "cut_found" || phase === "split_check" || phase === "result") && result;
  const keptStart = showCut ? result.firstKeptIndex : -1;
  const prefixStart = showCut && result.isSplitTurn ? result.turnStartIndex : -1;
  const prefixEnd = showCut && result.isSplitTurn ? result.firstKeptIndex : -1;

  // Render entry list
  let ry = listStartY;
  const displayStart = Math.max(0, Math.min(scrollOffset, entries.length - (listEndY - listStartY)));
  const displayEnd = Math.min(entries.length, displayStart + (listEndY - listStartY));

  // === Result phase: render summary block instead of old entries ===
  if (isResultPhase) {
    if (st.historySummary) {
      // Render history summary (replaces all summarized entries)
      const summaryLines = st.historySummary.split("\n");
      const boxW = listW - 4;
      term.at(ry, 2, S.dim("┌" + "─".repeat(boxW) + "┐"));
      ry++;
      const sumTitle = "  Summarized Region — 摘要区域 (灰色条目 → LLM 摘要) ".padEnd(boxW + 1);
      term.at(ry, 2, S.dim("│") + S.accent(S.bold(sumTitle)) + S.dim("│"));
      ry++;
      term.at(ry, 2, S.dim("├" + "─".repeat(boxW) + "┤"));
      ry++;
      for (const line of summaryLines) {
        if (ry >= listEndY - 5) break;
        const displayLine = line.length > boxW - 2 ? line.slice(0, boxW - 5) + "…" : line;
        term.at(ry, 2, S.dim("│ ") + S.dim(displayLine.padEnd(boxW - 1)) + S.dim("│"));
        ry++;
      }
      term.at(ry, 2, S.dim("└" + "─".repeat(boxW) + "┘"));
      ry++;
    }

    // Show turn prefix summary if split turn
    if (st.turnPrefixSummary) {
      ry++;
      const prefixLines = st.turnPrefixSummary.split("\n");
      const pboxW = listW - 4;
      term.at(ry, 2, S.yellow("┌" + "─".repeat(pboxW) + "┐"));
      ry++;
      const tpTitle = "  Turn Prefix — 被切割的 Turn 前半部分 ".padEnd(pboxW + 1);
      term.at(ry, 2, S.yellow("│") + S.yellow(S.bold(tpTitle)) + S.yellow("│"));
      ry++;
      term.at(ry, 2, S.yellow("├" + "─".repeat(pboxW) + "┤"));
      ry++;
      for (const line of prefixLines) {
        if (ry >= listEndY - 3) break;
        const displayLine = line.length > pboxW - 2 ? line.slice(0, pboxW - 5) + "…" : line;
        term.at(ry, 2, S.yellow("│ ") + S.yellow(displayLine.padEnd(pboxW - 1)) + S.yellow("│"));
        ry++;
      }
      term.at(ry, 2, S.yellow("└" + "─".repeat(pboxW) + "┘"));
      ry++;
    }

    // Separator between summary and kept entries
    ry++;
    const sepLabel = " Kept Region (保留原文) ";
    const sepW = Math.max(0, listW - 4);
    const padW = Math.floor((sepW - sepLabel.length) / 2);
    const sepPad = "─".repeat(Math.max(0, padW));
    term.at(ry, 2, S.accent(S.bold(sepPad + sepLabel + sepPad)));
    ry++;

    // Render kept entries (from firstKeptIndex)
    for (let i = keptStart; i < entries.length && ry < listEndY; i++) {
      const e = entries[i];
      if (!e || e.type === "compaction") continue;
      if (!e.message) continue;
      const m = e.message;
      const rl = roleLabel(m.role);
      const content = trunc(m.content.split("\n")[0]!, listW - 15);
      const tokStr = fmtTok(m.tokens);
      const line = `${rl} ${content}`.padEnd(listW - 10) + S.dim(tokStr.padStart(6));

      if (i === keptStart) {
        term.at(ry, 2, S.accent("▸▸") + S.green(line));
      } else {
        term.at(ry, 2, "  " + S.green(line));
      }
      ry++;
    }
  } else {
    // === Non-result phases: normal entry list ===
    for (let i = displayStart; i < displayEnd && ry < listEndY; i++) {
      const e = entries[i];
      if (!e || ry >= listEndY) break;

      let color: (t: string) => string;
      let marker = "  ";

      if (e.type === "compaction") {
        term.at(ry, 2, S.dim("──── compaction boundary ────"));
        ry++; continue;
      }
      if (!e.message) { ry++; continue; }

      const m = e.message;

      //
      // 颜色标记规则 (各阶段不同):
      //   show_all:        白色=user  青色=assistant  灰色=toolResult
      //   finding_cutpoints: ◆绿色=可切割  ✕红色=toolResult(不可切割)  灰色=其他
      //   walking_back:     ←青色=当前检查项  黄色=已累积  灰色=保留区/历史
      //   cut_found / split_check: ▸青色=切割线  绿色=保留  黄色=turn前缀  灰色=历史
      //   result:          摘要区域替换为 LLM 生成的摘要文本
      if (phase === "finding_cutpoints" && result) {
        // Highlight valid cut points
        if (result.cutpoints.includes(i)) {
          color = m.role === "user" ? S.green : m.role === "assistant" ? S.yellow : S.white;
          marker = S.green("◆ ");
        } else if (m.role === "toolResult") {
          color = S.red;
          marker = S.red("✕ ");
        } else {
          color = S.dim;
        }
      } else if (phase === "walking_back" && result) {
        // Highlight entries being visited in backward walk
        if (highlightEntry >= 0 && i === highlightEntry) {
          color = S.accent;
          marker = S.accent("← ");
        } else if (result.cutPointIndices.slice(0, walkStep).includes(i)) {
          color = S.yellow;
          marker = "  ";
        } else if (i >= result.firstKeptIndex) {
          color = S.dim;
          marker = "  ";
        } else {
          color = S.dim;
        }
      } else if ((phase === "cut_found" || phase === "split_check") && result) {
        if (result.firstKeptIndex === i) {
          color = S.accent;
          marker = S.accent("▸▸");
        } else if (i >= keptStart) {
          color = S.green;
          marker = "  ";
        } else if (prefixStart >= 0 && i >= prefixStart && i < prefixEnd) {
          color = S.yellow;
          marker = S.yellow("◒ ");
        } else {
          color = S.dim;
        }
      } else {
        // show_all
        color = m.role === "user" ? S.white : m.role === "assistant" ? S.accent : S.dim;
      }

      const rl = roleLabel(m.role);
      const content = trunc(m.content.split("\n")[0]!, listW - 15);
      const tokStr = fmtTok(m.tokens);
      const line = `${rl} ${content}`.padEnd(listW - 10) + S.dim(tokStr.padStart(6));
      term.at(ry, 2, marker + color(line));
      ry++;
    }
  }

  // Scroll indicator (only for non-result phases since result shows all kept entries)
  if (!isResultPhase && (displayStart > 0 || displayEnd < entries.length)) {
    const pos = `${displayStart + 1}-${displayEnd} / ${entries.length}`;
    term.at(listEndY, 2, S.dim(`  ↑ scroll  [↑↓/jk]  (${pos})`));
  }

  // === Right panel: algorithm info ===
  let ix = infoX;
  let iy = listHeaderY;

  hdrBox(term, iy, ix, cols - 1, BOX, S.accent, " Algorithm State ");
  iy += 3;

  const totalTokAll = entries.reduce((sum, e) => sum + (e.message?.tokens ?? 0), 0);

  term.at(iy, ix, S.white("Total entries: ") + S.hiWhite(String(entries.length))); iy++;
  term.at(iy, ix, S.white("Total tokens:  ") + S.hiWhite(fmtTok(totalTokAll))); iy++;
  term.at(iy, ix, S.white("Context window:") + (overflow ? S.red(fmtTok(contextWindow)) : S.white(fmtTok(contextWindow)))); iy++;
  term.at(iy, ix, S.white("Keep budget:   ") + S.hiWhite(fmtTok(keepTokens))); iy++;
  iy++;

  if (result) {
    term.at(iy, ix, S.white("Valid cut pts: ") + S.hiWhite(String(result.cutpoints.length))); iy++;
    term.at(iy, ix, S.white("Cut index:     ") + (result.firstKeptIndex > 0 ? S.accent(String(result.firstKeptIndex)) : S.dim("none"))); iy++;
    term.at(iy, ix, S.white("Split turn:    ") + (result.isSplitTurn ? S.yellow("YES") : S.dim("no"))); iy++;
    if (result.isSplitTurn) {
      term.at(iy, ix, S.white("Turn start:    ") + S.yellow(String(result.turnStartIndex))); iy++;
    }
    iy++;
  }

  // Strategy explanation
  iy++;
  if (strategy === "context-full") {
    term.at(iy, ix, S.accent(S.bold("Strategy: context-full"))); iy++;
    term.at(iy, ix, S.dim("  1. 反向遍历，累积 token")); iy++;
    term.at(iy, ix, S.dim("  2. 找到有效切割点")); iy++;
    term.at(iy, ix, S.dim("  3. 旧消息 → LLM 摘要")); iy++;
    term.at(iy, ix, S.dim("  4. 新消息 → 保留原文")); iy++;
    term.at(iy, ix, S.dim("  5. 摘要 + 新消息 = 新上下文")); iy++;
  } else {
    term.at(iy, ix, S.yellow(S.bold("Strategy: handoff"))); iy++;
    term.at(iy, ix, S.dim("  1. 生成结构化交接文档")); iy++;
    term.at(iy, ix, S.dim("  2. 记录: 做了什么/改了什么")); iy++;
    term.at(iy, ix, S.dim("  3. 新 Agent 实例接手")); iy++;
    term.at(iy, ix, S.dim("  4. force toolChoice:none")); iy++;
  }

  // Phase description
  iy += 2;
  const stepNum2 = Object.keys(STEP_LABELS).indexOf(phase) + 1;
  const phaseDescs: Record<Phase, string> = {
    show_all: `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  完整会话 — 上下文已溢出 (${fmtTok(totalTokAll)} > ${fmtTok(contextWindow)})\n\n按 Space 开始压缩算法。`,
    finding_cutpoints: `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  扫描有效切割点\n\n◆ 绿色 = user/assistant (可切割)\n✕ 红色 = toolResult (绝不切割)\n\n原因: toolResult 必须紧跟 tool call,\n否则 LLM 看到孤立工具结果会出错。`,
    walking_back: `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  反向累积 Token\n\n从最新消息反向遍历,\n逐条累加 token 估算值。\n黄色 = 已累加的消息\n← 青色 = 当前正在检查\n\n累积量 >= keep 预算时停止。`,
    cut_found: `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  切割点确定\n\n累积量已超出 keep 预算！\n找到最近的合法切割点。\n▸▸ 青色 = 切割位置\n绿色 = 保留区域 (原文)\n灰色 = 将被摘要的历史`,
    split_check: result?.isSplitTurn
      ? `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  Split Turn 检测\n\n切割点落在 assistant 消息 —\n这不是完整 turn 边界！\n黄色 = turn prefix (需单独摘要)\n绿色 = 完整保留的条目\n\nTurn prefix 的 user+assistant 摘要后\n与 toolResult 拼接保留。`
      : `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  Turn 边界完整\n\n切割点恰好是 user 消息 —\n完整 turn 边界, 无需 split。\n直接进入结果阶段。`,
    result: `${S.bold(`Step ${stepNum2}/${TOTAL_STEPS}`)}  压缩完成\n\n左栏上方 = 摘要文本 (LLM 生成)\n左栏下方 = 保留原文\n\n这就是 compaction 后的新上下文:\n  [系统提示] + [摘要] + [保留区域]\n\n按 Space 重新演示。`,
  };

  const desc = phaseDescs[phase] || "";
  for (const line of desc.split("\n")) {
    if (iy < rows - 4) {
      term.at(iy, ix, S.white(line));
      iy++;
    }
  }

  // Bottom status bar
  term.at(rows, 1, S.gray("━".repeat(cols - 1)));
  const stepNum3 = Object.keys(STEP_LABELS).indexOf(phase) + 1;
  const statusParts: string[] = [];
  statusParts.push(`Step ${stepNum3}/${TOTAL_STEPS}: ${STEP_LABELS[phase]}`);
  statusParts.push(`Entries: ${entries.length}`);
  statusParts.push(`Tokens: ${fmtTok(totalTokAll)}`);
  term.at(rows, 2, S.dim(statusParts.join("  |  ")));
}

function hdrBox(term: Terminal, r: number, c1: number, c2: number, box: typeof BOX, color: (t: string) => string, title: string) {
  const w = c2 - c1 - 1;
  const hline = box.h.repeat(Math.max(0, w));
  term.at(r, c1, color(box.tl + hline + box.tr));
  term.at(r + 1, c1, color(box.v) + S.bold(title) + color(" ".repeat(Math.max(0, w - title.length + 1)) + box.v));
  term.at(r + 2, c1, color(box.bl + hline + box.br));
}

// === 主循环: 阶段机驱动的互动演示 ===
//
// 阶段流转 (按 Space 推进):
//   show_all → finding_cutpoints → walking_back → cut_found → split_check → result → show_all
//
// Split Turn 说明:
//   理想切割点在 user 消息上 (完整 turn 边界)。如果落在 assistant 消息上,
//   需要将前半部分 (user → 该 assistant 之前的消息) 单独摘要，保证 toolResult 不孤立。

async function main() {
  const entries = generateSession();
  const CONTEXT_WINDOW = 30000; // 30K — low enough to trigger compaction with our session
  const KEEP_TOKENS = 11200;  // tuned to produce a split-turn cut: lands on assistant #27, user #26 is turn prefix
  const totalTokens = entries.reduce((sum, e) => sum + (e.message?.tokens ?? 0), 0);

  const term = new Terminal();
  term.enter();
  process.stdin.resume();

  let phase: Phase = "show_all";
  let strategy: Strategy = "context-full";
  let result!: CutPointResult | null;
  let scrollOffset = 0;
  let walkStep = 0;
  let highlightEntry = -1;
  let historySummary = "";
  let turnPrefixSummary = "";
  let done = false;

  function updateResult() {
    result = findCutPoint(entries, 0, entries.length, KEEP_TOKENS);
  }

  function generateSummaries() {
    if (!result) return;
    const historyEnd = result.isSplitTurn ? result.turnStartIndex : result.firstKeptIndex;
    if (historyEnd > 0) {
      historySummary = generateSimulatedSummary(entries, 0, historyEnd);
    } else {
      historySummary = "";
    }
    if (result.isSplitTurn && result.turnStartIndex >= 0) {
      turnPrefixSummary = generateTurnPrefixSummary(entries, result.turnStartIndex, result.firstKeptIndex);
    } else {
      turnPrefixSummary = "";
    }
  }

  const renderS = (): RenderState => ({
    phase, strategy, entries, result,
    contextWindow: CONTEXT_WINDOW,
    keepTokens: KEEP_TOKENS,
    totalTokens,
    scrollOffset,
    walkStep,
    highlightEntry,
    historySummary,
    turnPrefixSummary,
  });

  const doRender = () => render(term, renderS());

  // Keyboard handling
  const handleKey = (k: Buffer) => {
    const s = k.toString();
    if (s === "q" || s === "\x03") {
      done = true;
      return;
    }

    if (s === "s") {
      strategy = strategy === "context-full" ? "handoff" : "context-full";
      doRender();
      return;
    }

    // Scroll
    if (s === "\x1b[A" || s === "k") {
      scrollOffset = Math.max(0, scrollOffset - 1);
      doRender();
      return;
    }
    if (s === "\x1b[B" || s === "j") {
      const maxVis = term.sz().rows - 12;
      scrollOffset = Math.min(entries.length - maxVis, scrollOffset + 1);
      if (scrollOffset < 0) scrollOffset = 0;
      doRender();
      return;
    }

    // Space: advance phase
    // 阶段机: 每按一次 Space 推进一个阶段
    // 从 walking_back 进入时会启动异步动画 (walkAnimation)，不等用户按键直接推进到 cut_found
    if (s === " ") {
      switch (phase) {
        case "show_all":
          updateResult();
          phase = "finding_cutpoints";
          break;
        case "finding_cutpoints":
          phase = "walking_back";
          walkStep = 0;
          highlightEntry = entries.length - 1;
          if (result) {
            // Start async walk animation
            walkAnimation();
          }
          return; // animation handles rendering
        case "walking_back":
          // Skip to end of walk
          phase = "cut_found";
          if (result) walkStep = result.cutPointIndices.length;
          highlightEntry = -1;
          break;
        case "cut_found":
          if (result?.isSplitTurn) {
            phase = "split_check";
          } else {
            generateSummaries();
            phase = "result";
          }
          break;
        case "split_check":
          generateSummaries();
          phase = "result";
          break;
        case "result":
          // Reset
          phase = "show_all";
          result = null;
          walkStep = 0;
          highlightEntry = -1;
          historySummary = "";
          turnPrefixSummary = "";
          break;
      }
      doRender();
      return;
    }
  };

  // 异步动画: 从最新消息逐条反向高亮，展示 token 累积过程
  // 当累积量 >= KEEP_TOKENS 时自动停止并推进到 cut_found 阶段
  async function walkAnimation() {
    if (!result || done) return;

    const indices = result.cutPointIndices;
    for (let i = 0; i < indices.length; i++) {
      if (done || phase !== "walking_back") return;
      walkStep = i + 1;
      highlightEntry = indices[i]!;
      doRender();

      // Check if we've exceeded the budget
      let acc = 0;
      for (let j = 0; j <= i; j++) {
        const ei = indices[j]!;
        acc += entries[ei]!.message!.tokens;
      }
      if (acc >= KEEP_TOKENS) {
        await Bun.sleep(600);
        phase = "cut_found";
        highlightEntry = -1;
        doRender();
        return;
      }

      await Bun.sleep(i < 5 ? 200 : 80);
    }
    // Finished walk without hitting budget (shouldn't happen normally)
    phase = "cut_found";
    highlightEntry = -1;
    doRender();
  }

  process.stdin.on("data", handleKey);
  doRender();

  // Wait for quit
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (done) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  term.leave();
  process.stdin.removeAllListeners("data");
  process.stdin.pause();

  // Print final summary
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  Context Compaction — 算法总结`);
  console.log(`${"=".repeat(55)}`);
  console.log(`  会话条目: ${entries.length}`);
  console.log(`  总 tokens: ${fmtTok(totalTokens)}`);
  console.log(`  上下文窗口: ${fmtTok(CONTEXT_WINDOW)}`);
  console.log(`  Keep 预算: ${fmtTok(KEEP_TOKENS)}`);
  console.log(`  策略: ${strategy}`);
  if (result) {
    console.log(`  切割点: entry #${result.firstKeptIndex}`);
    console.log(`  Split turn: ${result.isSplitTurn ? `YES (turn starts at #${result.turnStartIndex})` : "no"}`);
    const keptCount = entries.length - result.firstKeptIndex;
    const summarizedCount = result.isSplitTurn
      ? result.turnStartIndex
      : result.firstKeptIndex;
    const prefixCount = result.isSplitTurn ? result.firstKeptIndex - result.turnStartIndex : 0;
    console.log(`  保留: ${keptCount} entries (绿色)`);
    if (prefixCount > 0) console.log(`  Turn prefix: ${prefixCount} entries (黄色)`);
    console.log(`  摘要: ${summarizedCount} entries (灰色 → 变为下方摘要)`);
    console.log("");
    if (historySummary) {
      // Strip ANSI for clean terminal output
      const clean = historySummary.replace(/\x1b\[[0-9;]*m/g, "");
      console.log("  ── LLM 生成的摘要 (模拟) ──");
      for (const line of clean.split("\n")) {
        console.log(`  ${line}`);
      }
    }
    if (turnPrefixSummary) {
      const clean = turnPrefixSummary.replace(/\x1b\[[0-9;]*m/g, "");
      console.log("  ── Turn Prefix 摘要 ──");
      for (const line of clean.split("\n")) {
        console.log(`  ${line}`);
      }
    }
  }
  console.log(`${"=".repeat(55)}\n`);
  process.exit(0);
}

main().catch((e) => {
  process.stdout.write(SHOW + ALT_OFF);
  console.error(e);
  process.exit(1);
});
export {};
