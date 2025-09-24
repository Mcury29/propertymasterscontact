import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const app = express();

// Basic security / parsing
app.use(express.json({ limit: '100kb' }));
app.use(cors({
  origin: process.env.ORIGIN?.split(',').map(s => s.trim()),
  methods: ['POST', 'OPTIONS'],
}));

app.set('trust proxy', 1);
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
}));

// Validate incoming form
const Payload = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
  subject: z.string().max(140).optional().nullable(),
  message: z.string().min(1).max(5000)
});

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

app.get('/health', (_req, res) => res.json({ up: true }));

app.post('/api/contact', async (req, res) => {
  try {
    const data = Payload.parse(req.body);

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif">
        <h2>New Website Inquiry</h2>
        <p><b>Name:</b> ${escapeHtml(data.name)}</p>
        <p><b>Email:</b> ${escapeHtml(data.email)}</p>
        ${data.phone ? `<p><b>Phone:</b> ${escapeHtml(data.phone)}</p>` : ''}
        ${data.subject ? `<p><b>Subject:</b> ${escapeHtml(data.subject)}</p>` : ''}
        <hr/>
        <pre style="white-space:pre-wrap">${escapeHtml(data.message)}</pre>
      </div>
    `;

    await transporter.sendMail({
      from: `"Website Form" <${process.env.SMTP_USER}>`,
      to: process.env.TO_EMAIL || process.env.SMTP_USER,
      replyTo: `${data.name} <${data.email}>`,
      subject: data.subject || `New message from ${data.name}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || ''}\n\n${data.message}`,
      html
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ ok: false, error: 'Invalid payload', details: err.issues });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to send' });
  }
});

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on :${port}`));
