export async function POST(req) {
  const { userId, password } = await req.json();

  const envKey = `PASSWORD_${userId.toUpperCase()}`;
  const correctPassword = process.env[envKey];

  if (!correctPassword) {
    return Response.json({
      ok: false,
      error: `Password not configured for this user. Admin: add ${envKey} in Vercel environment variables.`,
    });
  }

  if (password !== correctPassword) {
    return Response.json({ ok: false, error: 'Incorrect password. Please try again.' });
  }

  return Response.json({ ok: true });
}
