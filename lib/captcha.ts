export async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET_KEY
  if (!secret) {
    console.error('HCAPTCHA_SECRET_KEY is not set')
    return false
  }

  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    })

    const data = await res.json()
    return data.success === true
  } catch (error) {
    console.error('hCaptcha verification failed:', error)
    return false
  }
}
