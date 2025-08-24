import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string };
  } catch (err) {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();  // ✅ ADD AWAIT
  const token = cookieStore.get('auth_token')?.value;
  
  if (!token) return null;
  
  const payload = await verifyToken(token);
  return payload;
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();  // ✅ ADD AWAIT
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
  
  // Also set a user_id cookie for quick checks
  cookieStore.set('user_logged_in', 'true', {
    httpOnly: false, // Can be read by client
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();  // ✅ ADD AWAIT
  cookieStore.delete('auth_token');
  cookieStore.delete('user_logged_in');
  cookieStore.delete('user_id');
}