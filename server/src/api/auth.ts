import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret_change_in_prod';
const JWT_EXPIRES = '7d';

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/**
 * Step 1 — Frontend calls this with the wallet address.
 * We return a nonce (random challenge) the user must sign.
 */
authRouter.get('/nonce/:address', h(async (req, res) => {
  const address = req.params.address.toLowerCase();
  if (!address.startsWith('0x') || address.length !== 42) {
    return res.status(400).json({ error: 'invalid wallet address' });
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  await prisma.user.upsert({
    where: { walletAddress: address },
    update: { nonce },
    create: { walletAddress: address, nonce },
  });

  res.json({
    nonce,
    message: `Sign this message to login to Trading Agent.\n\nWallet: ${address}\nNonce: ${nonce}`,
  });
}));

/**
 * Step 2 — Frontend sends address + signature.
 * We verify the signature proves wallet ownership → issue a JWT.
 */
authRouter.post('/verify', h(async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: 'address and signature required' });
  }

  const normalized = address.toLowerCase();
  const user = await prisma.user.findUnique({ where: { walletAddress: normalized } });
  if (!user || !user.nonce) {
    return res.status(400).json({ error: 'request a nonce first' });
  }

  // Reconstruct the exact message that was signed
  const message = `Sign this message to login to Trading Agent.\n\nWallet: ${normalized}\nNonce: ${user.nonce}`;

  // Verify the signature recovers to the claimed address
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return res.status(400).json({ error: 'invalid signature' });
  }

  if (recovered !== normalized) {
    return res.status(401).json({ error: 'signature mismatch' });
  }

  // Rotate the nonce so the same signature can't be replayed
  const newNonce = crypto.randomBytes(16).toString('hex');
  const updated = await prisma.user.update({
    where: { walletAddress: normalized },
    data: { nonce: newNonce },
  });

  const token = jwt.sign(
    { userId: updated.id, address: normalized },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );

  res.json({
    token,
    user: {
      id: updated.id,
      address: updated.walletAddress,
      tradingMode: updated.tradingMode,
    },
  });
}));

/**
 * Get current user profile (requires JWT).
 */
authRouter.get('/me', requireAuth, h(async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json({
    id: user.id,
    address: user.walletAddress,
    tradingMode: user.tradingMode,
    createdAt: user.createdAt,
  });
}));

/**
 * Update trading mode preference.
 */
authRouter.put('/me', requireAuth, h(async (req: any, res) => {
  const { tradingMode } = req.body;
  const valid = ['SPOT', 'LEVERAGE_ONLY'];
  if (tradingMode && !valid.includes(tradingMode)) {
    return res.status(400).json({ error: `tradingMode must be one of: ${valid.join(', ')}` });
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { ...(tradingMode && { tradingMode }) },
  });
  res.json({ id: user.id, address: user.walletAddress, tradingMode: user.tradingMode });
}));

/** JWT middleware — attaches userId to req. */
export function requireAuth(req: any, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as any;
    req.userId = payload.userId;
    req.walletAddress = payload.address;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
