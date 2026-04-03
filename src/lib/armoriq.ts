// lib/armoriq.ts
import { db } from './mongodb';
import { NextRequest, NextResponse } from 'next/server';

// Policy definitions — what each action requires
const POLICIES: Record<string, Policy> = {
  'baseline:create':  { requiresAuth: true,  rateLimit: 10,  allowedRoles: ['owner'] },
  'scan:run':         { requiresAuth: true,  rateLimit: 5,   allowedRoles: ['owner','analyst'] },
  'scan:external':    { requiresAuth: true,  rateLimit: 2,   allowedRoles: ['owner'], requiresApproval: true },
  'compare:run':      { requiresAuth: true,  rateLimit: 20,  allowedRoles: ['owner','analyst'] },
  'audit:read':       { requiresAuth: true,  rateLimit: 100, allowedRoles: ['owner','admin'] },
  'export:all':       { requiresAuth: true,  rateLimit: 1,   allowedRoles: ['admin'], requiresApproval: true },
};

// Blocked patterns — always rejected regardless of policy
const BLOCKED_PATTERNS = [
  /hacker/i, /exploit/i, /inject/i, /xss/i,
  /scrape.*(password|private|dm)/i,
  /bypass.*(auth|security)/i,
];

type Policy = {
  requiresAuth: boolean;
  rateLimit: number;  // requests per hour
  allowedRoles: string[];
  requiresApproval?: boolean;
};

type ArmorDecision = {
  allowed: boolean;
  reason?: string;
  auditId: string;
};

export async function armoriq(
  action: string,
  context: {
    userId: string;
    role: string;
    payload?: Record<string, unknown>;
    ip?: string;
  }
): Promise<ArmorDecision> {

  const timestamp = new Date();
  const auditId = crypto.randomUUID();

  // Step 1: Pattern-based blocking (hard rules)
  const payloadStr = JSON.stringify(context.payload || {});
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(payloadStr) || pattern.test(action)) {
      await logAudit({ auditId, timestamp, action, ...context,
        decision: 'blocked', reason: `Matched blocked pattern: ${pattern}` });
      return { allowed: false, reason: 'Action blocked by security policy', auditId };
    }
  }

  // Step 2: Policy lookup
  const policy = POLICIES[action];
  if (!policy) {
    await logAudit({ auditId, timestamp, action, ...context,
      decision: 'blocked', reason: 'Unknown action — no policy defined' });
    return { allowed: false, reason: 'No policy defined for this action', auditId };
  }

  // Step 3: Role check
  if (!policy.allowedRoles.includes(context.role)) {
    await logAudit({ auditId, timestamp, action, ...context,
      decision: 'blocked', reason: `Role '${context.role}' not permitted` });
    return { allowed: false, reason: 'Insufficient permissions', auditId };
  }

  // Step 4: Rate limit check
  const oneHourAgo = new Date(Date.now() - 3600_000);
  const recentCalls = await db.collection('audit_log').countDocuments({
    userId: context.userId, action,
    timestamp: { $gte: oneHourAgo },
    decision: 'allowed'
  });
  if (recentCalls >= policy.rateLimit) {
    await logAudit({ auditId, timestamp, action, ...context,
      decision: 'blocked', reason: `Rate limit exceeded: ${recentCalls}/${policy.rateLimit} per hour` });
    return { allowed: false, reason: 'Rate limit exceeded', auditId };
  }

  // Step 5: Approval gate (for sensitive actions)
  if (policy.requiresApproval) {
    const approved = await checkApproval(context.userId, action);
    if (!approved) {
      await logAudit({ auditId, timestamp, action, ...context,
        decision: 'blocked', reason: 'Requires manual approval' });
      return { allowed: false, reason: 'This action requires explicit approval', auditId };
    }
  }

  // All checks passed — allow
  await logAudit({ auditId, timestamp, action, ...context, decision: 'allowed' });
  return { allowed: true, auditId };
}

async function logAudit(entry: object) {
  await db.collection('audit_log').insertOne(entry);
}

async function checkApproval(userId: string, action: string): Promise<boolean> {
  const approval = await db.collection('approvals').findOne({
    userId, action,
    expiresAt: { $gte: new Date() },
    used: false
  });
  return !!approval;
}

// Next.js middleware wrapper
export function withArmorIQ(
  handler: (req: NextRequest) => Promise<NextResponse>,
  action: string
) {
  return async (req: NextRequest) => {
    const userId = req.headers.get('x-user-id') || 'anonymous';
    const role = req.headers.get('x-user-role') || 'guest';

    const decision = await armoriq(action, { userId, role,
      payload: await req.json().catch(() => ({})),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined });

    if (!decision.allowed) {
      return NextResponse.json(
        { error: decision.reason, auditId: decision.auditId },
        { status: 403 }
      );
    }
    return handler(req);
  };
}