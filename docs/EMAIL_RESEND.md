# Transactional email with Resend

Production sends (newsletter, MCP submissions, WebMCP reports) should use **Resend**, not Gmail SMTP. Gmail sends one SMTP message per subscriber and keeps a copy in **Sent** for each — which is why a 40-person newsletter looked like 40 inbox emails plus bounces.

## 1. Resend setup

1. Create an account at [resend.com](https://resend.com)
2. **Domains → Add domain** → `influzer.ai`
3. Add the DNS records Resend provides (SPF, DKIM, optional DMARC)
4. Wait for domain verification (usually minutes)
5. **API Keys → Create** → copy the key (`re_…`)

## 2. Lightsail `.env`

SSH to the server (`cd ~/logo`) and update `.env`:

```env
EMAIL_SERVICE=resend
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=Influzer <noreply@influzer.ai>
NEWSLETTER_FROM=Influzer Insights <insights@influzer.ai>
NEWSLETTER_REPLY_TO=mencke@gmail.com
```

Comment out or remove Gmail vars:

```env
# EMAIL_SERVICE=gmail
# EMAIL_USER=...
# EMAIL_PASS=...
```

Restart the app:

```bash
pm2 restart logo-generator
```

## 3. Test before the next newsletter

From the server (or locally with the same `.env`):

```bash
npm run email:test -- --to your@email.com
npm run email:test -- --to your@email.com --newsletter
```

The second command uses the same **From** as Insights broadcasts.

## 4. Send a newsletter

Unchanged — admin **Newsletter** tab or:

```bash
npm run newsletter:send -- --slug most-mcp-servers-are-still-demoware --test your@email.com
npm run newsletter:send -- --slug your-post-slug
```

With Resend, bounces go to Resend’s dashboard — not your personal Gmail Sent folder.

## Fallback providers

The code still supports **Gmail** (`EMAIL_SERVICE=gmail`) and generic **SMTP** (`SMTP_HOST`, etc.) if you need them for local dev.
