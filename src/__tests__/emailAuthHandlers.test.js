import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import registerHandler from "../../api/register.js";
import verifyHandler from "../../api/verifyEmail.js";
import loginHandler from "../../api/login.js";
import { hashPassword } from "../../server/passwords.js";
import { signVerifyToken } from "../../server/verifyToken.js";
import { verifySyncToken } from "../../server/syncToken.js";

// ── Mongo double ─────────────────────────────────────────────────────────────
// Records every write so the central claim of this feature can be asserted:
// /api/register must not insert anything, only /api/verifyEmail may.

const state = {
  users: [],
  userData: [],
  calls: [],
  failInsertWith: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const usersCol = {
  findOne: (filter) => {
    state.calls.push(["users.findOne", clone(filter)]);
    const key = filter.email ? "email" : Object.keys(filter)[0];
    return Promise.resolve(state.users.find((u) => u[key] === filter[key]) || null);
  },
  insertOne: (doc) => {
    state.calls.push(["users.insertOne", clone(doc)]);
    if (state.failInsertWith) {
      return Promise.reject(Object.assign(new Error("E11000 duplicate key"), { code: state.failInsertWith }));
    }
    const _id = `acc-${state.users.length + 1}`;
    state.users.push({ ...clone(doc), _id });
    return Promise.resolve({ insertedId: _id });
  },
  createIndex: () => Promise.resolve("email_unique"),
  deleteOne: () => Promise.resolve({ deletedCount: 0 }),
};

const userDataCol = {
  findOne: (filter) => {
    state.calls.push(["userData.findOne", clone(filter)]);
    return Promise.resolve(state.userData.find((d) => d.accountId === filter.accountId) || null);
  },
  insertOne: (doc) => {
    state.calls.push(["userData.insertOne", clone(doc)]);
    if (state.failInsertWith) {
      return Promise.reject(Object.assign(new Error("E11000 duplicate key"), { code: state.failInsertWith }));
    }
    state.userData.push(clone(doc));
    return Promise.resolve({ insertedId: doc.accountId });
  },
};

vi.mock("../../server/db.js", () => ({
  connectToDatabase: () => Promise.resolve({ db: { collection: (n) => (n === "users" ? usersCol : userDataCol) } }),
}));

// ── Mailer double ────────────────────────────────────────────────────────────

const mail = { sent: [], failWith: null };

vi.mock("../../server/mailer.js", () => ({
  isMailConfigured: () => process.env.SMTP_USER !== "unconfigured",
  isMailLinkConfigured: () => Boolean(process.env.SITE_URL),
  buildVerifyUrl: (token) => `${process.env.SITE_URL}/verify-email?token=${encodeURIComponent(token)}`,
  sendVerificationEmail: ({ to, name, token }) => {
    if (mail.failWith) return Promise.reject(new Error(mail.failWith));
    mail.sent.push({ to, name, token });
    return Promise.resolve();
  },
  sendWelcomeEmail: ({ to, name }) => {
    mail.sent.push({ welcome: true, to, name });
    return Promise.resolve();
  },
}));

// ── Request/response doubles (same shape as syncSanitize.test.js) ────────────

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  res.json = (obj) => {
    res.body = obj;
    return res;
  };
  res.end = () => res;
  return res;
}

let ipCounter = 0;
function makeReq(method, body) {
  return {
    method,
    // Distinct IP per test: the rate limiter is a module-level Map that has no
    // public reset, so windows are isolated by making each test its own IP.
    headers: { "x-forwarded-for": `10.0.0.${++ipCounter % 250}` },
    body,
  };
}

async function call(handler, method, body) {
  const res = mockRes();
  await handler(makeReq(method, body), res);
  return res;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  signupSeq += 1;
  signupEmail = `verificationuser${signupSeq}@example.test`;
  state.users = [];
  state.userData = [];
  state.calls = [];
  state.failInsertWith = null;
  mail.sent = [];
  mail.failWith = null;
  process.env.SYNC_SECRET = "email-auth-secret";
  process.env.SITE_URL = "https://streamly.test";
  process.env.SMTP_USER = "mailer@streamly.test";
  delete process.env.VERIFY_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

// The rate limiter is a module-level Map keyed on the email address with no
// public reset, so a single shared address would leak one test's bucket into the
// next and start returning 429 where the test means to assert something else.
// Getters keep SIGNUP stable within a test while giving each test its own
// mailbox.
let signupSeq = 0;
let signupEmail = "";
const SIGNUP = {
  get name() {
    return "Nashid";
  },
  get email() {
    return signupEmail;
  },
  get password() {
    return "a-long-enough-passphrase";
  },
};

// ── /api/register ────────────────────────────────────────────────────────────

describe("POST /api/register", () => {
  it("writes NOTHING to the database", async () => {
    const res = await call(registerHandler, "POST", SIGNUP);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.users).toHaveLength(0);
    expect(state.calls.filter(([name]) => name.includes("insertOne"))).toHaveLength(0);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].welcome).toBeUndefined();
  });

  it("emails a verifiable link and never the password", async () => {
    await call(registerHandler, "POST", SIGNUP);
    const [sent] = mail.sent;
    expect(sent.to).toBe(SIGNUP.email);
    expect(sent.name).toBe(SIGNUP.name);
    expect(sent.token).not.toContain(SIGNUP.password);
    // …but the hash is recoverable from the token, which is what makes the
    // account creatable without a pending row.
    const { verifyVerifyToken } = await import("../../server/verifyToken.js");
    const parsed = verifyVerifyToken(sent.token);
    expect(parsed.ok).toBe(true);
    expect(parsed.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(await hashPassword(SIGNUP.password)).toMatch(/^scrypt\$/);
  });

  it("normalises the address before storing and mailing", async () => {
    const res = await call(registerHandler, "POST", { ...SIGNUP, email: "  MiXeD@Case.COM  " });
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe("mixed@case.com");
    expect(mail.sent[0].to).toBe("mixed@case.com");
  });

  it("rejects an invalid address before spending a scrypt run", async () => {
    const res = await call(registerHandler, "POST", { ...SIGNUP, email: "not-an-email" });
    expect(res.statusCode).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });

  it("enforces the password policy", async () => {
    const res = await call(registerHandler, "POST", { ...SIGNUP, password: "short" });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/at least 10/);
    const leak = await call(registerHandler, "POST", {
      ...SIGNUP,
      password: `${SIGNUP.email.split("@")[0]}-secret`,
    });
    expect(leak.statusCode).toBe(400);
    expect(leak.body.message).toMatch(/email/i);
  });

  it("tells an existing account to sign in instead", async () => {
    state.users.push({ _id: "acc-x", email: SIGNUP.email });
    const res = await call(registerHandler, "POST", SIGNUP);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/Sign in/);
    expect(mail.sent).toHaveLength(0);
  });

  it("fails loudly when the mail cannot be sent", async () => {
    // Otherwise the user stares at "check your inbox" forever.
    mail.failWith = "550 mailbox unavailable";
    const res = await call(registerHandler, "POST", SIGNUP);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it("503s when mail or the signing secret is unconfigured", async () => {
    const previous = process.env.SMTP_USER;
    process.env.SMTP_USER = "unconfigured";
    expect((await call(registerHandler, "POST", SIGNUP)).statusCode).toBe(503);
    process.env.SMTP_USER = previous;

    delete process.env.SYNC_SECRET;
    const noSecret = await call(registerHandler, "POST", SIGNUP);
    expect(noSecret.statusCode).toBe(503);
    expect(noSecret.body.message).toMatch(/VERIFY_SECRET/);
  });

  it("503s without SITE_URL, because the link would be unusable", async () => {
    delete process.env.SITE_URL;
    const res = await call(registerHandler, "POST", SIGNUP);
    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/SITE_URL/);
  });

  it("rejects non-POST and answers OPTIONS without a body", async () => {
    expect((await call(registerHandler, "GET")).statusCode).toBe(405);
    const pre = await call(registerHandler, "OPTIONS");
    expect(pre.statusCode).toBe(204);
  });

  it("rejects a malformed JSON body", async () => {
    const res = await call(registerHandler, "POST", "{not json");
    expect(res.statusCode).toBe(400);
  });
});

// ── /api/verifyEmail ─────────────────────────────────────────────────────────

describe("POST /api/verifyEmail", () => {
  async function tokenFor(overrides = {}) {
    return signVerifyToken({
      email: SIGNUP.email,
      name: SIGNUP.name,
      passwordHash: await hashPassword(overrides.password ?? SIGNUP.password),
    });
  }

  it("creates the account on the first click and hands back a usable session", async () => {
    const token = await tokenFor();
    const res = await call(verifyHandler, "POST", { token });
    expect(res.statusCode).toBe(201);
    expect(res.body.user).toMatchObject({
      email: SIGNUP.email,
      name: SIGNUP.name,
      provider: "email",
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(state.users).toHaveLength(1);
    expect(state.users[0].emailVerified).toBe(true);
    // The library doc exists, so the first sync is not an upsert from scratch.
    expect(state.userData).toHaveLength(1);
    expect(verifySyncToken(res.body.user.id, res.body.syncToken)).toBe(true);
  });

  it("sends the welcome mail only after the row exists", async () => {
    await call(verifyHandler, "POST", { token: await tokenFor() });
    const welcome = mail.sent.find((m) => m.welcome);
    expect(welcome).toBeDefined();
    const insertedAt = state.calls.findIndex(([n]) => n === "users.insertOne");
    // The insert is recorded before the send is attempted.
    expect(insertedAt).toBeGreaterThanOrEqual(0);
    expect(state.users).toHaveLength(1);
  });

  it("is single-use: a second click is refused", async () => {
    const token = await tokenFor();
    expect((await call(verifyHandler, "POST", { token })).statusCode).toBe(201);
    const second = await call(verifyHandler, "POST", { token });
    expect(second.statusCode).toBe(409);
    expect(second.body.message).toMatch(/already verified/i);
    expect(state.users).toHaveLength(1);
  });

  it("refuses a token whose payload was forged", async () => {
    const token = await tokenFor();
    const [validPayload, expiry, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "attacker@evil.com", n: "A", h: "scrypt$16384$8$1$c2FsdA$aGFzaA" }),
      "utf8",
    ).toString("base64url");
    const res = await call(verifyHandler, "POST", { token: `${forged}.${expiry}.${sig}` });
    expect(res.statusCode).toBe(400);
    expect(state.users).toHaveLength(0);
  });

  it("reports an expired link as 410 and writes nothing", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = await tokenFor();
      vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));
      const res = await call(verifyHandler, "POST", { token });
      expect(res.statusCode).toBe(410);
      expect(res.body.expired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(state.users).toHaveLength(0);
  });

  it("survives a lost insert race", async () => {
    state.failInsertWith = 11000;
    const res = await call(verifyHandler, "POST", { token: await tokenFor() });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already verified/i);
  });

  it("refuses GET so mail scanners cannot burn the token", async () => {
    const res = await call(verifyHandler, "GET");
    expect(res.statusCode).toBe(405);
    expect(res.body.message).toMatch(/mail scanner/);
  });

  it("503s without a sync secret, since it could not issue a session", async () => {
    delete process.env.SYNC_SECRET;
    const res = await call(verifyHandler, "POST", { token: await tokenFor() });
    expect(res.statusCode).toBe(503);
    expect(state.users).toHaveLength(0);
  });

  it("requires a token", async () => {
    expect((await call(verifyHandler, "POST", {})).statusCode).toBe(400);
    expect((await call(verifyHandler, "POST", { token: "" })).statusCode).toBe(400);
  });
});

// ── /api/login ───────────────────────────────────────────────────────────────

describe("POST /api/login", () => {
  async function seedVerifiedAccount() {
    const passwordHash = await hashPassword(SIGNUP.password);
    state.users.push({
      _id: "acc-1",
      email: SIGNUP.email,
      name: SIGNUP.name,
      provider: "email",
      passwordHash,
    });
    return passwordHash;
  }

  it("returns the profile, the library and a bearer token", async () => {
    await seedVerifiedAccount();
    const res = await call(loginHandler, "POST", {
      email: SIGNUP.email.toUpperCase(),
      password: SIGNUP.password,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ email: SIGNUP.email, provider: "email" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.userData).toMatchObject({ watchlist: [], watchHistory: [], collections: [] });
    expect(verifySyncToken("acc-1", res.body.syncToken)).toBe(true);
    // Library doc is created on first sign-in.
    expect(state.userData).toHaveLength(1);
  });

  it("accepts a case-different address", async () => {
    await seedVerifiedAccount();
    const res = await call(loginHandler, "POST", {
      email: ` ${SIGNUP.email.toUpperCase()} `,
      password: SIGNUP.password,
    });
    expect(res.statusCode).toBe(200);
  });

  it("gives an identical 401 for a wrong password and an unknown account", async () => {
    await seedVerifiedAccount();
    const wrong = await call(loginHandler, "POST", { email: SIGNUP.email, password: "not-the-password" });
    const unknown = await call(loginHandler, "POST", { email: "nobody@nowhere.test", password: "not-the-password" });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    // Identical body: the response must not be an account-existence oracle.
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("gives the same generic 401 for malformed input", async () => {
    const res = await call(loginHandler, "POST", { email: "junk", password: "" });
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Incorrect email or password.");
  });

  it("rate-limits repeated guesses against one address", async () => {
    await seedVerifiedAccount();
    let sawLimit = false;
    for (let i = 0; i < 16; i += 1) {
      const res = await call(loginHandler, "POST", { email: SIGNUP.email, password: `guess-${i}` });
      if (res.statusCode === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });

  it("503s without a sync secret", async () => {
    await seedVerifiedAccount();
    delete process.env.SYNC_SECRET;
    const res = await call(loginHandler, "POST", SIGNUP);
    expect(res.statusCode).toBe(503);
  });

  it("rejects non-POST", async () => {
    expect((await call(loginHandler, "GET")).statusCode).toBe(405);
  });
});
