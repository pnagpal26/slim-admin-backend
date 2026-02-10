import { Resend } from 'resend'
import { getSecret } from './get-secret'

let _resend: Resend | null = null
async function getResend(): Promise<Resend> {
  if (!_resend) _resend = new Resend(await getSecret('RESEND_API_KEY'))
  return _resend
}

const APP_NAME = 'SLIM'
const COMPANY_SIG = `\n\n— ${APP_NAME}\nQuestions? Reply to this email or reach us at support@getslim.app\n\n${APP_NAME} · 10200 Yonge St, Unit 101, Richmond Hill, ON L4C 3P3 · getslim.app`

export async function sendAdminInviteEmail(options: {
  to: string
  inviteeName: string
  role: string
  setupUrl: string
}): Promise<{ success: boolean; error?: string }> {
  const { to, inviteeName, role, setupUrl } = options

  const roleLabel: Record<string, string> = {
    support_l1: 'Support L1',
    support_l2: 'Support L2',
  }

  const subject = `You've been invited to ${APP_NAME} Admin`
  const body = `Hi ${inviteeName || 'there'},

You've been invited to the ${APP_NAME} admin backend as ${roleLabel[role] || role}.

Click below to set up your account:

${setupUrl}

This link expires in 24 hours.

Once you're in, you'll have access to customer accounts, error logs, and audit history. Your access level and permissions are based on your assigned role.

If you weren't expecting this, you can safely ignore it.${COMPANY_SIG}`

  try {
    const resend = await getResend()
    const { error } = await resend.emails.send({
      from: `${APP_NAME} <hello@getslim.app>`,
      to: [to],
      subject,
      text: body,
    })

    if (error) {
      console.error(`[Admin Email] Resend error for invite to ${to}:`, error)
      return { success: false, error: error.message }
    }

    console.log(`[Admin Email] Sent invite to ${to}`)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Admin Email] Failed to send invite to ${to}:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}
