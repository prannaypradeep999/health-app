import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email, firstName } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_WAITLIST_TABLE_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            Email: email,
            'First Name': firstName || '',
            'Signed Up At': new Date().toISOString(),
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      // Airtable returns 422 with INVALID_VALUE_FOR_COLUMN when email is duplicate
      if (res.status === 422 || (err?.error?.type === 'INVALID_VALUE_FOR_COLUMN')) {
        return NextResponse.json({ error: 'Already on the waitlist!' }, { status: 409 });
      }
      console.error('Airtable error:', err);
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Waitlist error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
