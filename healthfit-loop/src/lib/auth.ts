import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  lastLoginAt: Date | null;
}

export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  return nanoid(32);
}

/**
 * Create a new user account
 */
export async function createUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthUser> {
  const { email, password, firstName, lastName } = data;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (existingUser) {
    throw new AuthError('User with this email already exists', 'USER_EXISTS');
  }

  // Hash password and create user
  const hashedPassword = await hashPassword(password);
  const verificationToken = generateToken();

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      verificationToken,
      emailVerified: true // Auto-verify for now, can add email verification later
    }
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt
  };
}

/**
 * Authenticate a user with email and password
 */
export async function authenticateUser(email: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (!user) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const isPasswordValid = await verifyPassword(password, user.password);
  if (!isPasswordValid) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Update last login time
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    lastLoginAt: new Date()
  };
}

/**
 * Create a user session
 */
export async function createSession(userId: string): Promise<string> {
  const sessionId = nanoid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.userSession.create({
    data: {
      userId,
      sessionId,
      expiresAt
    }
  });

  return sessionId;
}

/**
 * Get user by session ID
 */
export async function getUserBySession(sessionId: string): Promise<AuthUser | null> {
  const session = await prisma.userSession.findUnique({
    where: { sessionId },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      // Clean up expired session
      await prisma.userSession.delete({
        where: { id: session.id }
      });
    }
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    emailVerified: session.user.emailVerified,
    lastLoginAt: session.user.lastLoginAt
  };
}

/**
 * Delete a user session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.userSession.deleteMany({
    where: { sessionId }
  });
}

/**
 * Get current user from cookies
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('auth_session')?.value;

  if (!sessionId) {
    return null;
  }

  return getUserBySession(sessionId);
}

/**
 * Set authentication cookie
 */
export async function setAuthCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('auth_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  });
}

/**
 * Clear authentication cookie
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('auth_session');
}

/**
 * Migrate guest data to user account
 */
export async function migrateGuestToUser(sessionId: string, userId: string): Promise<void> {
  const cookieStore = await cookies();
  const guestSessionId = cookieStore.get('guest_session')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;

  if (!guestSessionId && !surveyId) {
    return; // No guest data to migrate
  }

  try {
    // Find guest survey response
    const surveyResponse = surveyId
      ? await prisma.surveyResponse.findUnique({ where: { id: surveyId } })
      : await prisma.surveyResponse.findFirst({ where: { sessionId: guestSessionId } });

    if (surveyResponse && surveyResponse.isGuest) {
      // Migrate survey response to user
      await prisma.surveyResponse.update({
        where: { id: surveyResponse.id },
        data: {
          userId,
          isGuest: false
        }
      });

      // Migrate meal plans
      await prisma.mealPlan.updateMany({
        where: { surveyId: surveyResponse.id },
        data: { userId }
      });

      // Migrate workout plans
      await prisma.workoutPlan.updateMany({
        where: { surveyId: surveyResponse.id },
        data: { userId }
      });

      // Set active survey for user
      await prisma.user.update({
        where: { id: userId },
        data: { activeSurveyId: surveyResponse.id }
      });

      console.log(`[Auth] Successfully migrated guest data for user ${userId}`);
    }
  } catch (error) {
    console.error('[Auth] Error migrating guest data:', error);
    // Don't throw error - account creation should succeed even if migration fails
  }
}